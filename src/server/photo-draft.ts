import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as z from "zod";

import * as schema from "#/db/schema.ts";
import { photos } from "#/db/schema.ts";
import { jpegDataUrl } from "#/server/image-source.ts";
import { getCurrentUserId } from "#/server/user.ts";

const draftSchema = z
  .object({
    alt: z.string(),
    caption: z.string(),
  })
  .partial();

const generatePhotoDraftInput = z.object({
  fields: z
    .array(z.enum(["caption", "alt"]))
    .min(1)
    .default(["caption", "alt"]),
  id: z.string().min(1),
});

const captionInstruction =
  "caption はその写真がどこで何を撮ったものかが伝わる30文字以内の短い説明です。次のルールに従ってください。" +
  "建造物や施設や観光地や自然物など固有の名前が推測できる場合は、その名前をそのまま書く。" +
  "人が何かをしている場合は「◯◯する人」「◯◯の様子」のようにその行為を端的に書く。" +
  "名前が特定できない場合でも「駅のホーム」「商店街の路地」「海沿いの堤防」のように場所の種類がわかる言葉を使う。" +
  "被写体が明確な場合は被写体名を主語にし、撮影者が何に注目して撮ったかがわかるようにする。" +
  "詩的な言い回しや作品タイトルのような表現、「美しい」「印象的な」などの主観的評価、宣伝的な言い回しは使わない。" +
  "体言止めの1文だけとし、句点は付けない。";

const altInstruction =
  "alt はスクリーンリーダー利用者が視覚情報なしで内容を理解できる代替テキストです。次のルールに従ってください。" +
  "1文目は必ず「◯◯の写真」「◯◯のスクリーンショット」「◯◯の画像」のいずれかで始める。実写なら写真、PCやスマホの画面キャプチャならスクリーンショット、イラストや図解やCGなど上記以外なら画像とする。" +
  "続けて3〜5文程度で、構図や主要な要素を平易な日本語で説明的に描写する。専門用語や難しい言い回しは避ける。" +
  "投稿者が伝えたいであろう主題に関係する情報だけを書き、写っているものを網羅的に列挙しない。" +
  "「美しい」「素晴らしい」などの主観的評価や、「◯◯のように見えます」などの曖昧な推測表現は避ける。" +
  "人物は中立的に「人物」と表現し、性別や年齢などの属性は主題に明確に関係する場合のみ言及する。" +
  "スクリーンショットや文字が主要な情報となる画像では、説明の後に改行を入れて画像内のテキストを読みやすく書き起こす。ただしOSのステータスバーやブラウザのUIなど主題に関係しないUI要素は書き起こさない。";

export const generatePhotoDraft = createServerFn({ method: "POST" })
  .validator(generatePhotoDraftInput)
  .handler(async ({ data }) => {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { error: "ログインしてください", success: false } as const;
    }
    const db = drizzle(env.DB, { schema });
    const [photo] = await db
      .select({ storageKey: photos.storageKey })
      .from(photos)
      .where(and(eq(photos.id, data.id), eq(photos.userId, userId)))
      .limit(1);
    if (!photo) {
      return { error: "写真が見つかりません", success: false } as const;
    }

    // Base64 に展開すると約 4/3 に膨らむため AI に渡す前に縮小する
    const dataUri = await jpegDataUrl(photo.storageKey, { fit: "scale-down", width: 1024 });
    if (!dataUri) {
      return { error: "画像を読み込めませんでした", success: false } as const;
    }

    const wantsCaption = data.fields.includes("caption");
    const wantsAlt = data.fields.includes("alt");
    const jsonShape = data.fields.map((field) => `"${field}": "..."`).join(", ");
    const instruction = `あなたは写真管理アプリのアシスタントです。画像を見て日本語で ${data.fields.join(" と ")} を生成します。出力は必ず次のJSON形式のみとし、前後に文章を付けないでください: {${jsonShape}}。${wantsCaption ? captionInstruction : ""}${wantsAlt ? altInstruction : ""}`;

    const result = await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", {
      max_tokens: 512,
      messages: [
        {
          content: [
            { text: instruction, type: "text" },
            { image_url: { url: dataUri }, type: "image_url" },
          ],
          role: "user",
        },
      ],
      response_format: {
        json_schema: {
          properties: Object.fromEntries(data.fields.map((field) => [field, { type: "string" }])),
          required: data.fields,
          type: "object",
        },
        type: "json_schema",
      },
      temperature: 0.2,
    });

    // Workers AI は応答が JSON として解釈できる場合 response をパース済みのオブジェクトで返す
    const rawResponse: string | { alt?: string; caption?: string } = result.response;
    let caption = "";
    let alt = "";
    if (typeof rawResponse === "string") {
      const response = rawResponse.trim();
      const start = response.indexOf("{");
      const end = response.lastIndexOf("}");
      if (start !== -1 && end > start) {
        try {
          const parsed = draftSchema.parse(JSON.parse(response.slice(start, end + 1)));
          caption = parsed.caption ?? "";
          alt = parsed.alt ?? "";
        } catch {
          return { error: "AI の応答を解釈できませんでした", success: false } as const;
        }
      } else if (data.fields.length === 1) {
        // JSON でない応答は単一項目の生成に限り本文をそのまま採用する
        if (wantsCaption) {
          caption = response;
        } else {
          alt = response;
        }
      } else {
        return { error: "AI の応答を解釈できませんでした", success: false } as const;
      }
    } else {
      const parsed = draftSchema.safeParse(rawResponse);
      if (!parsed.success) {
        return { error: "AI の応答を解釈できませんでした", success: false } as const;
      }
      caption = parsed.data.caption ?? "";
      alt = parsed.data.alt ?? "";
    }

    return {
      alt: wantsAlt ? alt.trim() : null,
      caption: wantsCaption ? caption.trim() : null,
      success: true,
    } as const;
  });
