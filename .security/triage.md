# 脆弱性トリアージ台帳

スキャナ (Trivy / Dependency Review / `pnpm audit`) が出した finding を「優先対応」と
「無視してよいノイズ」に仕分けるための判断記録。サプレッションファイル
(`.trivyignore.yaml`) は本台帳の行を参照する。**台帳行のないサプレッションは禁止。**

## 中核原則

マニフェストの依存種別 (`dependencies` / `devDependencies`) は **到達性を評価した後の弱いシグナル**。
`drizzle-kit` はマニフェスト上 `dependencies` だが Worker ランタイムから import されない CLI である。
問う順序 (本アプリでの弁別力順):

1. 機能到達性 — 脆弱コードはデプロイ済み Cloudflare Worker で実行されるか (import グラフ。マニフェスト区分ではない)
2. ランタイム文脈適合 — 脆弱性クラスが V8 isolate / 当方の呼び出し方で成立するか
3. エクスプロイト前提 vs 実使用 — アドバイザリが要求する前提機能を実際に使うか
4. 露出面 — 公開アプリ・ユーザー写真・Clerk 認証・R2/D1 (影響上限)
5. CVSS — ティア内の緊急度のみ。ティア自体は決めない
6. 修正可用性/工数 — ノイズ判定ではなく対応方法に影響

## 判定フロー

```
Q1. 脆弱コードはデプロイ済み Worker で実行? (import グラフ)
    NO -> Q1a. 自分の管理 CI/build/migration で動く?
              NO  -> P3
              YES -> Q1b. build 入力は攻撃者影響可能?
                          NO  -> P3 (CVSS>=9 なら P2)
                          YES -> Q3 へ (到達扱い)
    YES -> Q2
Q2. 脆弱性クラスは V8-isolate Worker で成立? (Node API 不在で多くは不到達)
    成立しない -> P3
    成立/不明 -> Q3
Q3. アドバイザリ前提付きで脆弱機能を実際に呼ぶ?
    NO  -> P2
    YES/未検証 -> Q4
Q4. 到達 + ユーザー写真/認証/R2/D1/SSR 経路?
    CVSS H/C & ユーザーデータ経路 -> P0
    CVSS H, 到達, 主要経路外      -> P1
    CVSS M/L, 到達               -> 悪用容易性で P1/P2
```

## 優先度ティア

| ティア | 定義                                                               | SLA      | アクション                                              |
| ------ | ------------------------------------------------------------------ | -------- | ------------------------------------------------------- |
| P0     | Worker 到達・ユーザーデータ/認証経路・CVSS H/C・悪用可能           | 当日     | 修正必須。**サプレッション禁止**                        |
| P1     | 本番ランタイム到達・実害ありだが限定的                             | ≤ 7日    | 次の依存更新で対応。30日期限の一時サプレッションのみ可  |
| P2     | 管理 build/CI 到達、または ランタイム存在だが機能未使用/前提不成立 | ≤ 90日   | 追跡。自然な依存更新で修正。90日サプレッション + 台帳行 |
| P3     | 本番でも管理 build でも不到達                                      | 監視のみ | 期限付きサプレッション。期限で自動再浮上                |

CVSS は到達性を超えてティアを引き上げない (不到達の CVSS 10 でも P3)。

## 台帳

| GHSA/CVE            | package@ver     | path                                                                                                  | CVSS    | tier | 到達性判定                                                                   | 再エスカレーション trigger                                                                                                        | 期限       | links                                                                    |
| ------------------- | --------------- | ----------------------------------------------------------------------------------------------------- | ------- | ---- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| GHSA-67mh-4wv8-2f99 | esbuild@0.18.20 | drizzle-kit@0.31.10 > @esbuild-kit/esm-loader@2.6.5 > @esbuild-kit/core-utils@3.3.2 > esbuild@0.18.20 | 5.3 (M) | P3   | build 専用・`esbuild serve` 未使用・本番は patched esbuild 0.28.1 (下記詳細) | drizzle-kit が `serve` を呼ぶ使用に変化 / 経路が CI・deploy へ移動 / HIGH+ へ上方修正 or non-serve ベクタ追加 / `expired_at` 到達 | 2027-01-15 | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) |

### GHSA-67mh-4wv8-2f99 — 判定詳細

**Finding**: `esbuild@0.18.20`, CVSS 5.3 moderate。`esbuild serve` (HTTP dev server) が
許容的 CORS (`Access-Control-Allow-Origin: *`) を返し、任意の悪意サイトが dev-server の
レスポンスを読める。修正 >= 0.25.0。

- **Q1 (Worker で実行?)** NO。esbuild は build ツールで `@esbuild-kit/*` 配下は Worker
  ランタイムから import されない。`drizzle-kit` は `package.json` 上 `dependencies` だが
  本フレームワークは到達性を優先。lockfile 実測 (`pnpm-lock.yaml`) で脆弱 0.18.20 は
  `@esbuild-kit/*` 系統のみ。本番ビルド (vite 8 / @cloudflare/vite-plugin) は esbuild
  0.28.1 (patched)。
- **Q1a (管理 CI/build で実行?)** YES だが maintainer がローカルで `pnpm db:generate`
  / `db:migrate` / `db:push` / `db:studio` を実行した時のみ。`codecheck.yml` で
  drizzle-kit は走らず deploy ワークフローも無い。
- **Q1b (build 入力は攻撃者影響可能?)** NO。maintainer マシン上で本人の設定 + schema を
  読むのみ。untrusted PR コードは関与しない。
- **Q3 (脆弱機能を実際に呼ぶ?)** NO。アドバイザリは `esbuild serve` 起動が前提。
  drizzle-kit のローダは config トランスパイルに transform/build API をワンショット
  使用するのみで `serve` を呼ばずポートも開かない。アプリの dev server は vite の
  esbuild 0.28.1 で別物。
- **露出**: 本番面ゼロ。0.18.20 は Worker に載らずユーザー写真/Clerk/R2/D1 に無関係。

**判定: P3 — ノイズ / 追跡付きサプレッション。** CVSS 5.3 では P3 を超えない
(重大度は不到達を覆さない)。

**残留リスク (正直に明記)**: maintainer がローカルで `pnpm db:studio` 実行中に攻撃
サイトを閲覧した場合、その legacy esbuild が serve ポートを開いていれば理論上ヒット —
だが drizzle-kit のローダ使用では開かないため残留リスクは実質ゼロ。かつローカル開発
限定でデプロイ済みアプリ/CI には一切無関係。受容可。

**期限前の自然修正見込み**: drizzle-kit が deprecated `@esbuild-kit/*` (`tsx` へ統合済)
を除去、または grouped Dependabot が drizzle-kit を脆弱解決の先へ更新。
