# Coding Agent Guidelines

## 基本原則

- コミットメッセージ・コメント・エラーメッセージ・ユーザーとのやり取りはすべて日本語で行ってください。
- ファイルを削除する前に、対象・変更内容・影響範囲を報告して明示的な承認を得てください。
- 不明な点は推測で進めず質問してください。
- 実装後は `pnpm run codecheck` を実行し、エラーをコミット前に解消してください。許可なく `.oxlintrc.json` や `tsconfig.json` を変更して回避してはなりません。
- コミットメッセージは `feat:` `fix:` `chore:` などの prefix を付けた日本語 1 行とし、本文は書かないでください。

## UX ライティング

- ボタンやリンクのラベルは体言止めにせず「アップロードする」のように動詞で言い切ってください。
- 画面内で同じ情報を重複して表示しないでください。
- 文言を追加・変更するときは、同じ画面や近い機能の表記・語尾に揃えてください。

## ツールチェーンのバージョン

Node は `package.json` の `devEngines.runtime`、pnpm は `packageManager` で固定します。`mise.toml` や `.node-version` は使いません。

- `devEngines.runtime.onFail` を `download` にしてはなりません。npm は `download` を解釈できず `EBADDEVENGINES` で落ち、`npx wrangler` を使う Workers Builds のデプロイが失敗します
- Node の自動ダウンロードは `pnpm-workspace.yaml` の `runtimeOnFail: download` が担います
- pnpm 12 はネイティブバイナリのため、pnpm 11 以下からは自動で切り替われず `SyntaxError` になります。`curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=12.14.0 sh -` で入れ直してください

## データベース

- `pnpm run db:generate` で `src/db/schema.ts` から `./drizzle` にマイグレーションを生成し、`pnpm wrangler d1 migrations apply photo --local` / `--remote` で適用します
- マイグレーションを含む変更をデプロイする前に、必ず `--remote` の適用を済ませてください。忘れると本番だけスキーマが古く、ローカルで再現しないエラーになります。未適用分は `pnpm wrangler d1 migrations list photo --remote` で確認できます

## プレビューデプロイ

Clerk の本番インスタンスは `newt239.dev` 配下にしか redirect できないため、`*.workers.dev` のプレビューでは Clerk の Development インスタンスを使います。プレビューは CI により Worker `fernweh` のバージョンとして作られ、別 Worker には出せません。

Version command は次のとおりです。

```
npx wrangler versions upload --var CLERK_PUBLISHABLE_KEY_PREVIEW:$VITE_CLERK_PUBLISHABLE_KEY_PREVIEW --var CLERK_SECRET_KEY_PREVIEW:$CLERK_SECRET_KEY_PREVIEW
```

- 本番の secret と同じ名前を `--var` で上書きしてはなりません。過去に本番の Clerk キーが Worker から消え、全リクエストが 500 になりました
- `src/start.ts` は `*_PREVIEW` があればそれを優先し、無ければ `VITE_CLERK_PUBLISHABLE_KEY` と secret の `CLERK_SECRET_KEY` を使います
- `*_PREVIEW` には `VITE_` を付けず、Worker の secret にも登録しません。ビルド変数は本番と共通なので、本番のビルドに混入します
- `--var` の値はダッシュボードから見えるため、本番の値を渡してはなりません
- `VITE_CLERK_PUBLISHABLE_KEY` はビルド変数のみで、Worker のバインディングには登録しません。プレビュー時は `infra/cloudflare-build.sh` が差し替えます
- D1 と R2 は本番と共有です。`user_identities` が Clerk の user_id を解決するため、同じメールアドレスなら本番と同じデータを扱います

## アーキテクチャ

### TanStack Start

RSC は存在しません。`"use client"` / `"use server"` / `import "server-only"` など Next.js App Router の書き方を持ち込まないでください。

- loader の戻り値はクライアントに JSON として渡るため、秘匿情報を含めてはなりません
- サーバー専用処理は `src/server/` の server function に置きます。`src/lib` はクライアントからも読み込まれるため、`cloudflare:workers` の `env` や Clerk のサーバー API を使ってはなりません

### 画像配信

画像は R2 の公開ドメインから Worker を経由せず配信し、リサイズは `/cdn-cgi/image/` に任せます。

- URL は必ず `src/lib/image-url.ts` の `photoImageUrl` で組み立ててください
- 幅の種類だけ変換回数が増えるため、`srcSet` の候補は最小限にしてください
- HEIC は `finalizePhoto` がアップロード時に JPEG へ変換します

### アップロードと R2 の CORS

ブラウザから R2 へ直接 PUT するため、配信元の origin が R2 の CORS に無いと `Failed to fetch` で失敗し、Worker にログは残りません。origin は `infra/r2-cors.json` に追記し、`pnpm wrangler r2 bucket cors set photo --file infra/r2-cors.json` で適用してください。`https://*.newtpia.workers.dev` はプレビュー用なので消してはなりません。

### ディレクトリ構成

- ルートはディレクトリで階層を表現します。レイアウトは `route.tsx`、末尾 `_` のセグメント（例: `albums_/`）は非ネストルートです
- コンポーネントは `components/<atoms|molecules|organisms>/<PascalCase>/index.tsx` と `<Name>.module.css` に置き、バレルファイルを作ってはなりません
- 層は再利用回数ではなく粒度で決めます。atoms は状態もドメイン知識も持たない単一要素、molecules は単一目的の UI、organisms は状態や server function を扱うセクションです
- templates と pages は `src/routes` に書きます
- コンポーネント名は所在ではなく役割で付けます（`PublicAlbumGallery` ではなく `PhotoGallery`）
- 一覧の列数を JS の幅計測で決めてはなりません。SSR と列数がずれてちらつきます。列数ごとの位置を CSS カスタムプロパティで出力し、コンテナクエリで切り替えてください（例: `PhotoMasonry`）
- 別ディレクトリのモジュールは相対パスではなく `#/`（`src/`）エイリアスでインポートしてください

## 不変条件（絶対に破らないこと）

- 公開状態を持つのはアルバムだけ。写真は公開アルバムに 1 つでも属していれば公開される
- アクセス判定は (1) オーナー本人なら可、(2) 公開アルバムに属していれば可、それ以外は不可
- この判定が守るのはメタデータだけで、画像本体は URL を知っていれば誰でも取得できる。そのため非公開写真の `storage_key` を公開ページの loader やレスポンスに含めてはならない
- バイナリは D1 に入れず R2 に保存し、DB には `storage_key` のみ保持する
- 新規テーブルには `user_id` 列とインデックスを入れる
- `src/routeTree.gen.ts` は編集しない

## API 規約

- search params は `validateSearch` + zod でバリデーションする
- server function は `createServerFn().validator().handler()` で定義し、エラーはスローせず `{ success: false, error: "..." } as const` などの結果オブジェクトで返す
- Drizzle の `sql` で相関サブクエリを書くときは `${table}.col` と修飾する。`${table.col}` は非修飾になり JOIN 先の列に解決されることがある

## コーディングガイドライン

- `any` は禁止。`unknown` や `never` も避け、実データに一致する型を定義する
- 型アサーションは禁止。やむを得ず使う場合は理由をコメントで書く
- `interface` は禁止で `type` を使う。宣言マージが必須な `src/router.tsx` の `Register` のみ例外とし、理由をコメントで書く
- コメントは原則書かない。他のルールが求める場合のみ 1 行で、括弧を使わずに書く
- 抽象化しすぎない。3 箇所以上から使われない util 関数や、3 行以下の関数は作らず呼び出し元に書く。3 行を超える処理が 2 箇所以上から呼ばれる場合は関数にしてよい
- 関数・コンポーネント・loader の戻り値に型注釈を付けない
- Promise を `void` で捨てず、`onClick={() => { handleSubmit(); }}` のように文として書く
- `readonly` / `Readonly<>` を使わない
- コンポーネントファイルにはコンポーネントと Props 型だけを置き、className などはインラインで書く
- データ取得は loader で行い `Route.useLoaderData()` で参照する。`useEffect` はブラウザ API やイベントリスナーなど真に必要な場合のみ使い、理由をコメントで書く
- server function の呼び出し中は `useTransition` などでローディングを表示し、ボタンを `disabled` にする
