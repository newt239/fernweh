# Coding Agent Guidelines

## 目次

- [基本原則](#基本原則)
- [UX ライティング](#ux-ライティング)
- [開発コマンド](#開発コマンド)
- [アーキテクチャ](#アーキテクチャ)
- [不変条件（絶対に破らないこと）](#不変条件絶対に破らないこと)
- [API 規約](#api-規約)
- [コーディングガイドライン](#コーディングガイドライン)

## 基本原則

- 常に日本語でコミュニケーションを行ってください。すべてのコミットメッセージ、コメント、エラーメッセージ、ユーザーとのやり取りは日本語で行ってください。
- ファイルの削除を行う場合は、必ず実行前に以下を報告し、明示的なユーザー承認を得てください。
  - 対象ファイルのリスト
  - 実行する変更の詳細説明
  - 影響範囲の説明
- 不明な点がある場合は常に質問し、推測で進めてはなりません。
- 実装後の必須作業として、`pnpm run codecheck`を実行してください。
  - 型エラーやリンターのエラーが出た場合は、コミット前に必ず修正してください。
  - ユーザーが明示的に許可した場合を除き、エラーを解消するために`.oxlintrc.json`や`tsconfig.json`を変更してはなりません。

### コミットメッセージ

- コミットメッセージは原則として `feat:` `fix:` `docs:` `chore:` `refactor:` `test:` `ci:` などの prefix を付けた日本語の 1 行で記述してください。
- 本文（複数行の詳細説明）は原則として書かないでください。

## UX ライティング

- ボタンやリンクのラベルは体言止め（名詞で終える言い方）ではなく、動詞 +「する」で終える言い切りの形にしてください（例:「アップロードする」「アルバムを作成する」）。
- 画面内で同じ情報を重複して表示しないでください（例: ヘッダーにアプリ名が表示済みの場合、本文で同じ文言を繰り返さない）。
- 新しい文言を追加・変更する前に、同じ画面や近い機能で既に使われている表記・語尾を確認し、トーンを揃えてください。

## 開発コマンド

### 基本コマンド

- `pnpm run dev` - 開発サーバーを起動（http://localhost:3000）
- `pnpm run build` - 本番アプリケーションをビルド
- `pnpm run preview` - 本番ビルドをローカルでプレビュー
- `pnpm run cf-typegen` - Cloudflare バインディングの型を生成
- `pnpm run typecheck` - TypeScript で型チェック
- `pnpm run codecheck` - typecheck + lint + format + knip を一括実行

### ツールチェーンのバージョン

Node は `package.json` の `devEngines.runtime`、pnpm は `packageManager` で固定します。`mise.toml` や `.node-version` は使いません。

- `devEngines.runtime.onFail` は `ignore` にしてあります。`download` にしてはなりません。npm はバージョンが一致しないときだけ `onFail` を見ますが `download` を解釈できず `EBADDEVENGINES` で落ち、Workers Builds の deploy command が `npx wrangler` なのでデプロイが失敗します
- pnpm 側の自動ダウンロードは `pnpm-workspace.yaml` の `runtimeOnFail: download` で維持しています。`pnpm install` が Node を取得してロックファイルに固定し、`pnpm run` 経由のコマンドがそのランタイムで動きます
- pnpm 12 はネイティブバイナリのため、pnpm 11 以下は `packageManager` を見ても自動で切り替われず `SyntaxError` になります。手元の pnpm が 11 以下なら `curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=12.14.0 sh -` で入れ直してください

### データベース

- `pnpm run db:generate` - `src/db/schema.ts` からマイグレーション SQL を `./drizzle` に生成
- `pnpm run db:studio` - Drizzle Studio を起動
- `pnpm wrangler d1 migrations apply photo --local` - ローカル D1 にマイグレーションを適用
- `pnpm wrangler d1 migrations apply photo --remote` - 本番 D1 にマイグレーションを適用

`drizzle/` にマイグレーションを追加した変更をデプロイする際は、必ず `--remote` の適用を先に実行してください。適用を忘れると本番のスキーマだけが古いまま残り、ローカルでは再現しない実行時エラーになります。未適用のマイグレーションは `pnpm wrangler d1 migrations list photo --remote` で確認できます。

### プレビューデプロイ

Clerk の本番インスタンスは primary domain `newt239.dev` とそのサブドメインしか redirect 先として許可しないため、`*.workers.dev` のプレビュー URL では本番キーだとログインできません。プレビューでは Clerk の Development インスタンスを使います。

Workers Builds は production ブランチ以外へのコミットでは deploy command の代わりに Version command を実行し、production に昇格しないバージョンを作ります。このバージョンは接続先の Worker `fernweh` の上に載ります。`wrangler.jsonc` に別環境を書いても CI が Worker 名を `fernweh` に上書きするため、別 Worker には出せません。

本番の secret と同じ名前を `--var` で上書きしてはなりません。一度それで本番の `CLERK_SECRET_KEY` と `VITE_CLERK_PUBLISHABLE_KEY` が Worker から消え、全リクエストが 500 になりました。プレビュー用の値は別名で渡し、コード側で優先します。

Version command は次のとおりです。

```
npx wrangler versions upload --var CLERK_PUBLISHABLE_KEY_PREVIEW:$VITE_CLERK_PUBLISHABLE_KEY_PREVIEW --var CLERK_SECRET_KEY_PREVIEW:$CLERK_SECRET_KEY_PREVIEW
```

- `src/start.ts` が `clerkMiddleware` に `CLERK_PUBLISHABLE_KEY_PREVIEW` / `CLERK_SECRET_KEY_PREVIEW` を優先して渡します。無ければビルド時に焼き込まれた `VITE_CLERK_PUBLISHABLE_KEY` と Worker secret の `CLERK_SECRET_KEY` を使います
- `VITE_CLERK_PUBLISHABLE_KEY` は Worker のバインディングとして登録しません。ビルド変数だけで足ります。平文の変数として登録すると `wrangler deploy` のたびに消えます。secret は消えません
- この 2 つは `VITE_` を付けません。`VITE_` を付けるとビルド時にバンドルへ焼き込まれ、ビルド変数が production と preview で共通なので本番のビルドにも入ってしまいます
- 同じ理由で、この 2 つを Worker の secret として登録してはなりません。バージョン単位の `--var` でのみ渡します
- publishable key はバンドルにも焼き込まれるため、`infra/cloudflare-build.sh` が `WORKERS_CI_BRANCH` が `main` 以外のときだけ `VITE_CLERK_PUBLISHABLE_KEY` を差し替えます
- `--var` はバージョン単位の平文の変数になり、ダッシュボードから値が見えます。本番の値をここに渡してはなりません
- D1 と R2 は本番と同じリソースを使います。Clerk のインスタンスが別でも `user_identities` が Clerk の user_id をアプリ内の `user_id` に解決するため、同じメールアドレスなら本番と同じ写真・アルバムを扱います

## アーキテクチャ

### 技術スタック

- **言語**: TypeScript / React 19
- **フレームワーク**: TanStack Start（TanStack Router による file-based routing）
- **UI**: Mantine v9 + CSS Modules（postcss-preset-mantine）
- **ビルド**: Vite
- **コード品質**: Oxlint / Oxfmt
- **Git hooks**: Lefthook
- **デプロイ**: Cloudflare Workers（wrangler / @cloudflare/vite-plugin）
- **データベース**: Cloudflare D1 + Drizzle ORM
- **認証**: Clerk
- **ストレージ**: Cloudflare R2（画像本体。DB には `storage_key` のみ保持）
- **画像配信**: R2 の公開ドメイン `img.newt239.dev` から直接配信し、リサイズは `/cdn-cgi/image/` に任せる（Worker を経由しない）

### RSC は存在しない

TanStack Start は RSC を使いません。full-document SSR + hydration + server functions です。`"use client"` / `"use server"` / `import "server-only"` は使用できません。Next.js App Router の書き方を持ち込まないでください。

- **loader の戻り値はクライアントに JSON としてシリアライズされます**。秘匿すべき情報を含めてはなりません
- サーバー専用処理は server function（`createServerFn`）に置きます

### 画像配信

画像の URL は `src/lib/image-url.ts` の `photoImageUrl` で組み立ててください。URL を直接書いてはなりません。配信元は環境変数 `VITE_IMAGE_BASE_URL` で指定します。

- 幅を渡すと `/cdn-cgi/image/` 経由でリサイズされ、渡さないと R2 の原本がそのまま返ります
- 表示に使う幅の種類を増やすと変換の回数がその分増えます。`srcSet` の候補は必要最小限にしてください
- HEIC は原本のままだと Chrome などで表示できないため、`finalizePhoto` がアップロード時に JPEG へ変換して保存します

### アップロードと R2 の CORS

アップロードはブラウザから R2 の S3 エンドポイントへ直接 PUT します。Worker を経由しないため、配信元の origin を R2 バケットの CORS に登録しないとブラウザにブロックされ、`UploadDropzone` の `uploadOne` が投げる PUT の `fetch` が `Failed to fetch` で失敗します。Worker のログには何も残りません。

許可する origin は `infra/r2-cors.json` で管理します。新しい配信元を増やしたときはこのファイルに追記し、次のコマンドで適用してください。

```
pnpm wrangler r2 bucket cors set photo --file infra/r2-cors.json
```

プレビューは `https://*.newtpia.workers.dev` で配信されるため、この 1 行を消すとプレビューからのアップロードが動かなくなります。

### プロジェクト構造

```bash
src/
├── routes/                 # TanStack Router の file-based routes（ディレクトリ記法）
│   ├── __root.tsx          # ルートドキュメント（HTML シェル）
│   ├── admin/              # 管理画面（要ログイン）
│   │   ├── route.tsx       # /admin のレイアウト（Outlet を持つ）
│   │   ├── albums/         # /admin/albums 配下
│   │   └── albums_/        # /admin/albums/$slug にネストさせない画面
│   ├── albums/$slug/       # 公開アルバムページ
│   └── api/                # API ルート（画像配信など）
├── router.tsx              # ルーターの生成（getRouter）
├── routeTree.gen.ts        # 自動生成（編集禁止）
├── components/             # Atomic Design（atoms / molecules / organisms）
│   ├── atoms/              # 単一の要素。ドメイン知識も状態も持たない
│   ├── molecules/          # atoms の組み合わせ。単一の目的を持つ制御 UI・カード
│   └── organisms/          # それ自体で意味を持つセクション。server function も扱う
├── providers/              # アプリ全体を包む Provider（Clerk など）
├── server/                 # server functions（createServerFn）とサーバー専用処理
├── db/                     # Drizzle スキーマと DB クライアント
├── lib/                    # 複数ファイルから使う関数・定数
└── env.ts                  # 環境変数のバリデーション（@t3-oss/env-core）
```

- ルートはドット記法ではなくディレクトリで階層を表現してください。`<Outlet />` を持つレイアウトは `route.tsx`、末尾に `_` が付いたセグメント（例: `albums_/`）は親レイアウトにネストさせない非ネストルートです。`createFileRoute` の引数はディレクトリ構成と一致させてください。
- コンポーネントは `components/<層>/` の下に PascalCase のディレクトリを作り、その下に `index.tsx` と CSS Module を置いてください（例: `components/molecules/PhotoCard/index.tsx` と `components/molecules/PhotoCard/PhotoCard.module.css`）。`index.tsx` 以外に再エクスポートだけのバレルファイルを作ってはなりません。
- 層は再利用される回数ではなく粒度で決めてください。`atoms` は単一の要素で状態もドメイン知識も持たないもの、`molecules` は atoms を組み合わせた単一目的の UI、`organisms` は複数の状態や server function を扱う独立したセクションです。
- 一覧の列数は JS で幅を計測して決めてはなりません。SSR した HTML と計測後で列数が変わり初期表示がちらつきます。列数ごとの位置を CSS カスタムプロパティとして出力し、どれを使うかは CSS のコンテナクエリに決めさせてください（`AlbumMasonry` / `PhotoGallery` / `PhotoMasonry` が実装例です）。
- Atomic Design の templates（レイアウト）と pages は `components` に置かず、`src/routes` に書いてください。`route.tsx` がテンプレート、各ルートの `component` がページに相当します。
- コンポーネント名は所在ではなく役割で付けてください（`ProfileSection` ではなく `UserProfile`、`PublicAlbumGallery` ではなく `PhotoGallery`）。
- コンポーネント固有のスタイルはコンポーネント名の CSS Module（例: `PhotoCard.module.css`）に記述してください。
- `src/lib` はクライアントからも読み込まれます。`cloudflare:workers` の `env` や Clerk のサーバー API を使う処理は `src/server` に置いてください。

### インポートとパスエイリアス

- 同階層でないモジュールをインポートする場合は、**相対パスではなくパスエイリアスを使用してください**。
- プロジェクトでは `#/` が `src/` にマップされています。例: `#/lib/format.ts` → `src/lib/format.ts`。
- コンポーネントは `#/components/molecules/PhotoCard` のように層とディレクトリを指定してインポートしてください。
- **同一ディレクトリ内**のインポートでは相対パス（`./PhotoCard.module.css` など）を使用して構いません。

## 不変条件（絶対に破らないこと）

- **公開の単位はアルバム**。写真は自身の公開状態を持たず、visibility を持つのは album だけ。写真は公開アルバムに 1 つでも属していれば公開される
- アクセス判定の順序: (1) オーナー本人なら常に可、(2) 公開アルバムに属していれば可、いずれでもなければ不可
- **この判定が守るのはメタデータだけ**。画像本体は R2 の公開ドメイン `img.newt239.dev` から直接配信され、判定を通らない。URL を知っていれば非公開アルバムの写真も取得できる
- 上記の結果として `storage_key` は秘匿値として扱う。非公開の写真の `storage_key` を公開ページの loader やレスポンスに含めてはならない
- 画像などのバイナリを D1 に入れない。R2 に保存し、DB には `storage_key` のみ保持する
- 新規テーブルには `user_id` 列とインデックスをデフォルトで入れる（将来の多ユーザー化に備えた shared-ready 設計）
- `src/routeTree.gen.ts` は自動生成ファイルのため編集しない

## API 規約

- ルート定義は `createFileRoute`、search params は `validateSearch` + zod でバリデーションする
- server function は `createServerFn().validator().handler()` で定義し、`src/server/` に置く
- server function はエラーをスローせず、結果オブジェクト（`{ success: false, error: "..." } as const` など）で返す
- Drizzle の `sql` テンプレートで相関サブクエリを書く場合、列は `${table}.col` の形で修飾する（`${table.col}` は非修飾になり JOIN 先の列に解決されることがある）

## コーディングガイドライン

### `any`の禁止

- いかなる理由があっても`any`を使用してはなりません。
- `unknown`や`never`の使用も避けてください。
- 実データと一致する型を定義してください。

### 型アサーションの禁止

- 型アサーションは禁止です。
- 型アサーションを使用する場合は、明確な理由をコメントアウトとして記述してください。

### `interface`の禁止

- 型定義に`interface`を使用してはなりません。`type`を使用してください。
- 唯一の例外は宣言マージが必須の場面（`src/router.tsx` の `Register`）です。理由をコメントで記述してください。

### コメントの禁止

- 原則としてコメントは記述してはなりません。
- 型アサーションやuseEffectの使用理由など、他のガイドラインが記述を求める場合のみ例外とします。
- コメントを書く場合は 1 行以内に収め、括弧を使用しないでください。

### 過度な抽象化の禁止

- 無駄に関数化・定数化しすぎてはなりません。
- 再利用される明確な根拠がない限り、処理の切り出しや定数への抽出を行わないでください。
- 3 箇所以上から使われない util 系の関数は作らないでください。1 箇所でしか使わない処理は呼び出し元に直接書いてください。
- 実装が 3 行以下の関数は、使用箇所が何箇所あっても関数化せず、呼び出し元にそのまま書いてください。
- ただし 3 行を超える処理が 2 箇所以上から呼ばれる場合は、重複を避けるため関数のままで構いません。

### 戻り値の型注釈は書かない

- 関数やコンポーネントの戻り値に型注釈を付けてはなりません。TypeScript の推論に任せてください。
- ルートの `loader` も同様です。推論結果がそのまま `Route.useLoaderData()` の型になります。

### void 演算子の禁止

- Promise を返す関数の呼び出しを `void handleSubmit()` のように `void` で捨ててはなりません。
- 戻り値を使わない場合は `onClick={() => { handleSubmit(); }}` のように文として書いてください。

### readonly の禁止

- 型定義やコンポーネントの Props に `readonly` / `Readonly<>` を付けないでください。
- 配列の型も `readonly T[]` ではなく `T[]` と書いてください。

### コンポーネントファイルの構成

- コンポーネントファイルにはコンポーネント関数とその Props 型以外を原則置かないでください。
- className 等はモジュールレベルの変数やヘルパー関数に切り出さず、使用箇所にインラインで記述してください。

### useEffectの禁止

- 初期データを取得するためにuseEffectを使用してはなりません。
- データ取得はルートの loader で行い、`Route.useLoaderData()` で参照してください。
- ブラウザAPIアクセスやイベントリスナー登録など、真に必要な場合のみuseEffectの使用を許可します。この場合は明確な理由をコメントアウトとして記述すべきです。

### ローディング表示

- server function の呼び出し中は`useTransition`等でローディング表示を行ってください。
- ボタンを連打できないように`disabled`を設定してください。
