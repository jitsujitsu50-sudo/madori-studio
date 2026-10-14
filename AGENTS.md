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
- **メイン画面は3D**（v35〜）。ページを開くと3Dビルダーが自動で開く。2Dの間取り図は右上「2D間取り図」で表示し、URLに `#2d` が付く（リロードしても2Dのまま。`index.html#2d` で2Dから開ける）。2Dの「3D編集へ」で戻ると `#2d` は消える。3D中のEscは画面を閉じない（選択解除・屋根パネルを閉じる）。
- 注意: `app.js` のグローバル `history` は undo 用の配列でブラウザの履歴を隠している。ブラウザ履歴は `window.history` を使うこと。
- 静的サイト。ビルド不要。公開対象は `dist/` のみ。
- `dist/index.html` — UI。CSS/JS は `?v=番号` でキャッシュ対策。**変更したら番号を上げる**（現在 v35）。
- `dist/app.js` — 2D間取り編集。`items`（部屋・壁・建具・家具）と `floorTiles` を管理。
- `dist/tatami.js` — 2D の畳数指定（部屋追加時の畳数、プロパティの畳数・畳数固定、リサイズ時の面積維持）。`app.js` の直後に読み込み、`updateInspector`/`smartResize`/プロパティ入力を上書きする。
- `dist/plans.js` — プラン管理（複数プランの保存・切替・複製・名前変更・削除、ファイル書き出し/読み込み）。`tatami.js` の後に読み込み、`save` を上書きして編集中プランの控えを更新する。
- `dist/builder3d.js` — 3Dルームビルダー（three.js / WebGL）。編集ツール・ホットバー（1〜9・0キー：部屋/床/消す/壁/ドア/窓/家具/塗る/移動/歩く）・ゴースト表示・部屋ラベル・ウォークモード。
- `dist/b3assets.js` — 3D素材（手続き生成テクスチャ、環境光、家具/建具モデル、効果音）。`builder3d.js` より先に読み込む。
- `dist/vendor/three.min.js` — three.js r160.1（同梱。外部CDN不使用）。
- `dist/styles.css`

## データ設計（壊さないこと）
- localStorage `madori-data`: `{items, floorTiles, hiddenEdges, wallPaint, roof, name, grid, tatami, dataVersion}`
  - 項目の追加は「後方互換で追加のみ」。古いデータ（hiddenEdges なし）も読めること。
- localStorage `madori-plans`: プラン一覧 `[{id,name,data(=madori-dataと同じJSON文字列),wallHeight,createdAt,updatedAt}]`。`madori-current-plan`: 編集中プランのid。編集中のデータ本体は従来どおり `madori-data`。プランを開くと `madori-data` に書き込んで再読み込みする。
- 書き出しファイル `*.madori.json`: `{format:'madori-studio-plan',version:1,name,wallHeight,data:{…madori-dataと同じ…}}`。
- localStorage `madori-wall-height`: 壁高(cm)。`madori-underlay`: 下絵画像。`madori-sound`: 効果音 on/off。
- 座標は plan px（`PX=80` px = 1m）。3D は meter 単位（plan px / PX）。plan x → 3D X, plan y → 3D Z。
- `floorTiles` は 2D/3D 共有。3D 床はグリッド座標 `gx = round(x/size)` に正規化。
- 自動壁: 4方向連結で4マス以上の床群の外周 + 部屋(rotation≈0)の間仕切り。3Dで消した自動壁は `hiddenEdges`（キー `h|v:x:y:size`、plan px）。
- 3Dで追加した壁は 2D の `type:'wall'` アイテム（`from3d:true`、直線上で自動結合）。壁色は `wallColor`。
- 床マスの床材は `floorTiles[].mat`（oak/walnut/whiteoak/tile/marble/tatami/carpet/mortar/deck/grass/gravel/concrete）。`grass`(庭)/`gravel`(砂利)/`concrete`(駐車場) も `outdoor:true`：延床に含めず、自前の壁も手すりも作らない（室内床との境だけ壁）。`deck` はバルコニー床：屋外扱いで、室内床との境は壁、外気側の辺は手すり（自動壁の `rail:true`）になる。`mat` なしの古いデータは `color` で着色した木目で表示。2Dで色を塗り直すと `mat` は消える。
- 自動壁の壁色は `wallPaint`（キー = hiddenEdges と同じ辺キー → 色）。
- 家具の3D形状は追加フィールド `variant`（モデル名: sofa/lsofa/couch/roundTable/lowTable/rack/car/tree など）で決まる。`variant` のない古い家具は名前から推定（`B3A.kind`）。カタログは `B3A.CATALOG`（`{name,v,cat,w,d}`、先頭16件は旧順序を維持）とカテゴリ `B3A.CATS`。3Dで家具を選ぶと同じカテゴリ内で種類を変更できる（中心を保ってサイズを置き換え）。
- `roof`（v34、なければ null＝屋根なし）: `{type:'none'|'flat'|'shed'|'gable'|'hip', pitch:寸(2〜8), dir:'auto'|'x'|'z'(棟の向き), flip:片流れの高い側反転, mat:'kawara'|'terracotta'|'slate'|'galva', eave:軒の出m, show}`。屋根は「4マス以上つながった室内床」グループごとの外接矩形にかかる（`buildingBoxes`）。`app.js` の state/restoreState/save/load で保存・undo 対象。壁を下げる表示中は非表示、移動/歩く以外の編集中は半透明。
- 壁掛けテレビ（`variant:'wallTv'`）は配置時にポインタ位置の壁へ吸着し、カメラ側を向く。
- 部屋の形は `points`（0〜1の単位座標の多角形。四角=`[[0,0],[1,0],[1,1],[0,1]]`、L字は6点）。3Dの床マスと間仕切り壁は「中心が多角形の内側にあるマス」(`roomCellKeys`)から作るので、L字でも正しい壁になる。部屋は rotation を使わず、90°回転は points を回して幅・奥行きを入れ替える。
- 3Dの移動ツールで部屋をドラッグすると、床マス（マスごとの床材を保持）・中の家具・壁上のドア/窓が一緒に動く。取っ手でサイズ変更（畳数固定なら反対方向が追従）。近くの部屋の辺へマグネット吸着し、接する辺は同じ辺キーになるので壁は1枚。
- 部屋アイテムの追加フィールド `tatami`（数値）＝畳数固定。面積 `tatami × 畳の規格(tatami())` を維持する（幅を変えると奥行きが追従）。3Dの「部屋」ツールで置いた部屋は選んだ畳数で固定される（グリッドに合わせるため実面積は近似。ラベルに実際の畳数を表示）。
- ドア・窓は 2D の opening アイテム（door は item の下辺が壁線）。3D の見た目の種類は追加フィールド `style`：door=両開き`double`/玄関`entrance`/ガラス`glass`、sliding-door=片引き`single`/引き違い`double`/折れ戸`folding`/掃き出し窓`hakidashi`、window=小窓`small`。一覧は `builder3d.js` の `OPENINGS`。

## 変更後の確認（必須）
1. `node --check dist/app.js && node --check dist/tatami.js && node --check dist/plans.js && node --check dist/b3assets.js && node --check dist/builder3d.js`
2. 実ブラウザで操作確認（3D: 床ドラッグ・壁・ドア/窓・家具移動・視点、2D同期、リロード後の保存）
3. index.html のバージョン番号を上げてコミット → `main` に push

## 履歴メモ
- v35: 3Dをメイン画面に（起動時に3D、右上に「保存・プラン」「2D間取り図」、#2dで2D表示を維持、Escで閉じない）。トーストが3D画面の裏に隠れていたのを修正（z-index、3D中は上部表示）
- v34: 屋根（なし/陸屋根/片流れ/切妻/寄棟、勾配2〜8寸、棟の向き、片流れの反転、瓦/洋瓦/スレート/ガルバリウム、軒の出、表示切替 Tキー）、妻壁、壁掛けテレビ（55/65型、壁に吸着）
- v33: 家具を「カテゴリ→種類」で選ぶ方式に（51種：丸テーブル・こたつ・L字デスク・スツール・オフィスチェア・座椅子・L字ソファ・カウチ・二段ベッド・布団・収納ラック・本棚・ワードローブ・食器棚・アイランドキッチン・丸ラグ・ランプ・車・自転車・庭木・植え込み・ガーデンテーブル・物置など）。置いた家具は選択パネルの▼で種類変更。部屋に庭・駐車場・クローゼット・ウォークインクローゼット追加（廊下は細長、駐車場は2.5×5m）。床材に芝生・砂利・コンクリート。2Dで丸テーブルは円、L字ソファ/デスクはL形表示。壁1面モードでも新しい壁はなぞって描ける
- v32: 壁ツールに「壁1面ごと」モード（クリックで角〜角の直線の壁をまとめて撤去／復活、`B3.wallMode='run'`）と「1マスずつ」モード（従来のなぞり）。部屋選択時の「隣とつなげる」ボタンで、くっついた部屋との間の壁を一括撤去／復活（キッチン＋LD→LDK）。どちらも `hiddenEdges` に記録
- v25: Sites 公開済み（canvas 2D のアイソメ表示）
- v26: three.js 化、床ドラッグ塗り、3D壁編集、ドア/窓、家具移動、カメラ回転/ズーム、タッチ対応
- v31: 3Dで部屋を選択・移動・サイズ変更（取っ手）・90°回転・削除（床ごと）、L字の部屋、部屋同士のマグネット吸着（共有面は1枚の壁）、部屋ツールのパレットを左側パネルに
- v30: プラン管理（名前を付けて保存・一覧から開く・複製・名前変更・削除・新規）、ファイル書き出し/読み込み（別端末への移動・バックアップ）
- v29: 畳数で部屋を作成（2D: 広さ選択・畳数固定、3D: 部屋ツール＝12種のプリセット×1〜24畳、奥行き変更で畳数維持）、3D部屋ラベル、延床の坪数と規模の目安、タッチは「タップで配置」に変更
- v28: バルコニー（デッキ床＋手すり）、扉7種・窓4種（掃き出し窓で出入り可）、浴槽・トイレ・洗面台・洗濯機・冷蔵庫
- v27: ゲーム風UI（ホットバー1〜9キー、ゴースト表示、ポップ演出、効果音）、床材テクスチャ、壁塗り、幅木、建具部分の壁くり抜き、詳細な家具モデル、一人称ウォークモード（衝突判定・タッチスティック）

## 既知の課題
- スマホでは2D画面のツールバーが約514px幅あり、ページ全体が縮小表示される（3D画面は問題なし）。2Dのスマホ用レイアウト見直しが必要。
