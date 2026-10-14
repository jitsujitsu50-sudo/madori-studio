# 間取りスタジオ — 共同開発ルール（Claude / ChatGPT Codex 共通）

このリポジトリは Claude と ChatGPT(Codex) の両方が編集します。どちらのAIも作業前にこのファイルを読んでください。

## 正（source of truth）
- **GitHub: `jitsujitsu50-sudo/madori-studio` の `main` ブランチ** が唯一の正です。
- 作業開始時: `git status` と `git pull`（または fetch）で最新化し、HEAD を確認する。
- 作業終了時: コミットして `main` へ push する。push すると GitHub Pages が自動で公開される。
- ユーザーの未コミット変更や、ブラウザの localStorage データを壊さないこと。

## 公開先
1. **GitHub Pages（メイン・無料）**: https://jitsujitsu50-sudo.github.io/madori-studio/
   - `.github/workflows/pages.yml` が `main` への push ごとに `dist/` を公開する。
2. **ChatGPT Sites（任意）**: https://madori-studio-20261012.jitsujitsu50.chatgpt.site/
   - project_id: `appgprj_6accd181fb188191acfe57a19ce866f4`（`.openai/hosting.json`）
   - 公開設定は **public を必ず維持**。Codex にクレジットがある時だけ使う。
   - Sites の git remote は `origin`、GitHub は `github` という名前で登録している（Mac のローカルリポジトリ）。

## 構成
- 静的サイト。ビルド不要。公開対象は `dist/` のみ。
- `dist/index.html` — UI。CSS/JS は `?v=番号` でキャッシュ対策。**変更したら番号を上げる**（現在 v30）。
- `dist/app.js` — 2D間取り編集。`items`（部屋・壁・建具・家具）と `floorTiles` を管理。
- `dist/tatami.js` — 2D の畳数指定（部屋追加時の畳数、プロパティの畳数・畳数固定、リサイズ時の面積維持）。`app.js` の直後に読み込み、`updateInspector`/`smartResize`/プロパティ入力を上書きする。
- `dist/plans.js` — プラン管理（複数プランの保存・切替・複製・名前変更・削除、ファイル書き出し/読み込み）。`tatami.js` の後に読み込み、`save` を上書きして編集中プランの控えを更新する。
- `dist/builder3d.js` — 3Dルームビルダー（three.js / WebGL）。編集ツール・ホットバー（1〜9・0キー：部屋/床/消す/壁/ドア/窓/家具/塗る/移動/歩く）・ゴースト表示・部屋ラベル・ウォークモード。
- `dist/b3assets.js` — 3D素材（手続き生成テクスチャ、環境光、家具/建具モデル、効果音）。`builder3d.js` より先に読み込む。
- `dist/vendor/three.min.js` — three.js r160.1（同梱。外部CDN不使用）。
- `dist/styles.css`

## データ設計（壊さないこと）
- localStorage `madori-data`: `{items, floorTiles, hiddenEdges, wallPaint, name, grid, tatami, dataVersion}`
  - 項目の追加は「後方互換で追加のみ」。古いデータ（hiddenEdges なし）も読めること。
- localStorage `madori-plans`: プラン一覧 `[{id,name,data(=madori-dataと同じJSON文字列),wallHeight,createdAt,updatedAt}]`。`madori-current-plan`: 編集中プランのid。編集中のデータ本体は従来どおり `madori-data`。プランを開くと `madori-data` に書き込んで再読み込みする。
- 書き出しファイル `*.madori.json`: `{format:'madori-studio-plan',version:1,name,wallHeight,data:{…madori-dataと同じ…}}`。
- localStorage `madori-wall-height`: 壁高(cm)。`madori-underlay`: 下絵画像。`madori-sound`: 効果音 on/off。
- 座標は plan px（`PX=80` px = 1m）。3D は meter 単位（plan px / PX）。plan x → 3D X, plan y → 3D Z。
- `floorTiles` は 2D/3D 共有。3D 床はグリッド座標 `gx = round(x/size)` に正規化。
- 自動壁: 4方向連結で4マス以上の床群の外周 + 部屋(rotation≈0)の間仕切り。3Dで消した自動壁は `hiddenEdges`（キー `h|v:x:y:size`、plan px）。
- 3Dで追加した壁は 2D の `type:'wall'` アイテム（`from3d:true`、直線上で自動結合）。壁色は `wallColor`。
- 床マスの床材は `floorTiles[].mat`（oak/walnut/whiteoak/tile/marble/tatami/carpet/mortar/deck）。`deck` はバルコニー床：屋外扱いで、室内床との境は壁、外気側の辺は手すり（自動壁の `rail:true`）になる。`mat` なしの古いデータは `color` で着色した木目で表示。2Dで色を塗り直すと `mat` は消える。
- 自動壁の壁色は `wallPaint`（キー = hiddenEdges と同じ辺キー → 色）。
- 家具の3D形状は名前で決まる（`B3A.kind`: ベッド/ソファ/キッチン/テレビ/テーブル/デスク/椅子/植物/ラグ/収納）。
- 部屋アイテムの追加フィールド `tatami`（数値）＝畳数固定。面積 `tatami × 畳の規格(tatami())` を維持する（幅を変えると奥行きが追従）。3Dの「部屋」ツールで置いた部屋は選んだ畳数で固定される（グリッドに合わせるため実面積は近似。ラベルに実際の畳数を表示）。
- ドア・窓は 2D の opening アイテム（door は item の下辺が壁線）。3D の見た目の種類は追加フィールド `style`：door=両開き`double`/玄関`entrance`/ガラス`glass`、sliding-door=片引き`single`/引き違い`double`/折れ戸`folding`/掃き出し窓`hakidashi`、window=小窓`small`。一覧は `builder3d.js` の `OPENINGS`。

## 変更後の確認（必須）
1. `node --check dist/app.js && node --check dist/tatami.js && node --check dist/plans.js && node --check dist/b3assets.js && node --check dist/builder3d.js`
2. 実ブラウザで操作確認（3D: 床ドラッグ・壁・ドア/窓・家具移動・視点、2D同期、リロード後の保存）
3. index.html のバージョン番号を上げてコミット → `main` に push

## 履歴メモ
- v25: Sites 公開済み（canvas 2D のアイソメ表示）
- v26: three.js 化、床ドラッグ塗り、3D壁編集、ドア/窓、家具移動、カメラ回転/ズーム、タッチ対応
- v30: プラン管理（名前を付けて保存・一覧から開く・複製・名前変更・削除・新規）、ファイル書き出し/読み込み（別端末への移動・バックアップ）
- v29: 畳数で部屋を作成（2D: 広さ選択・畳数固定、3D: 部屋ツール＝12種のプリセット×1〜24畳、奥行き変更で畳数維持）、3D部屋ラベル、延床の坪数と規模の目安、タッチは「タップで配置」に変更
- v28: バルコニー（デッキ床＋手すり）、扉7種・窓4種（掃き出し窓で出入り可）、浴槽・トイレ・洗面台・洗濯機・冷蔵庫
- v27: ゲーム風UI（ホットバー1〜9キー、ゴースト表示、ポップ演出、効果音）、床材テクスチャ、壁塗り、幅木、建具部分の壁くり抜き、詳細な家具モデル、一人称ウォークモード（衝突判定・タッチスティック）

## 既知の課題
- スマホでは2D画面のツールバーが約514px幅あり、ページ全体が縮小表示される（3D画面は問題なし）。2Dのスマホ用レイアウト見直しが必要。
