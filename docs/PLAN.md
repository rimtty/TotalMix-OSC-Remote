# TotalMix-OSC-Remote 実装計画書

> **状態: 計画確定(v1.0 / 2026-08-08)** — TotalMix FX OSC プロトコル(公式マニュアル+RME スタッフのフォーラム回答+動作実績のある OSS 実装)と Stream Deck SDK(公式ドキュメント)の調査結果を反映済み。残る確認事項は §11 の実機検証項目のみ。

## 1. 背景と目的

- RME TotalMix FX は OSC(Open Sound Control)によるリモート制御に対応しており、フェーダー類は **Float32 の 0.0–1.0** を第一級の値として送受信する(例: `/1/mastervolume`)。
- 既存の Stream Deck 用「OSC Remote」プラグインは **Int 値しか送信できない**不具合があり、Float を期待する TotalMix FX のフェーダーを正しく操作できない。
- 本プロジェクトは、TotalMix FX 専用設計の Stream Deck プラグイン **TotalMix-OSC-Remote** を開発し、以下を実現する:
  1. **ダイヤル(Stream Deck + エンコーダー)**: TotalMix FX の任意のフェーダー(代表ユースケース: Hardware Outputs の Main フェーダー)を Float 精度で操作するフェーダーダイヤル。
  2. **キーボタン**: 指定チャンネルの **Mute** と **Fader Dim**(音量を約10%程度へ減衰)のトグル。
  3. ダイヤル/キー/タッチストリップ用の専用アイコン・表示デザイン。
  4. Fireface UCX II / UCX / Babyface Pro の OSC エンドポイント対応表ドキュメント。

## 2. スコープ

### 対象(v1)

- Stream Deck +(ダイヤル×4+タッチストリップ)および全 Stream Deck キーデバイス。
- アクション3種:
  - `fader-dial`(Encoder): フェーダーダイヤル
  - `mute-key`(Keypad): Mute トグル
  - `fader-dim-key`(Keypad): Fader Dim トグル
- TotalMix FX との UDP/OSC 双方向通信(値のフィードバック受信を含む)。
- Windows / macOS 両対応(通信は OS 非依存の UDP のため差分は最小)。

### 対象外(v1 では実装しない)

- EQ・ダイナミクス等チャンネル設定(OSC ページ2)の操作
- スナップショット/レイアウト切替
- レベルメーター表示
- MIDI 経由の Mackie Protocol 制御

## 3. 全体アーキテクチャ

```
┌────────────────────────── Stream Deck App ──────────────────────────┐
│  ┌───────────────┐   WebSocket    ┌─────────────────────────────┐  │
│  │ Property       │◄─────────────►│ プラグイン本体 (Node.js)      │  │
│  │ Inspector (HTML)│               │  ├ actions/fader-dial        │  │
│  └───────────────┘                │  ├ actions/mute-key          │  │
│                                   │  ├ actions/fader-dim-key           │  │
│                                   │  └ osc/  ← 共有シングルトン    │  │
│                                   └──────────┬──────────────────┘  │
└──────────────────────────────────────────────┼─────────────────────┘
                                    UDP (OSC packet, Float32)
                                               ▼
                                   TotalMix FX (OSC Remote Controller 1–4 の1枠)
                                   受信: 127.0.0.1:7001(慣例既定値)
                                   送信: 127.0.0.1:9001(慣例既定値)
```

- **言語/SDK**: TypeScript + `@elgato/streamdeck` **^2.1.0**(公式 Node.js SDK)+ `@elgato/cli`(`create` / `link` / `validate` / `pack`)。
  - manifest: `SDKVersion: 3`、`Nodejs.Version: "24"`、`Software.MinimumVersion: "6.9"`(エンコーダー機能自体は 6.0+ で動作。6.9 指定で将来の Marketplace DRM 要件も満たす)。
  - プラグイン本体は Stream Deck アプリ同梱の Node.js(20/24)プロセスとして動作し、標準ライブラリがフルに使える(`dgram` による UDP 通信に制約なし)。
- **OSC 層**: 依存を最小にするため OSC エンコーダ/デコーダを自前実装(仕様が小さく、Float32/Int32/String/Blob の型タグ処理のみ)。`osc-min` 等のライブラリ利用と比較して決定。**Float32 で送ることを型レベルで保証する**のが本プラグインの存在意義のため、送信パスは必ず `,f` 型タグを使う。
- **接続共有**: 全アクションインスタンスで 1 つの UDP ソケットペアを共有(シングルトン `OscClient`)。TotalMix 側の Remote Controller 枠(最大4)を1つだけ消費する。
- **状態管理**: TotalMix からのフィードバック(現在値・dB 文字列)を `OscState` にキャッシュし、各アクションが購読する。Stream Deck 側とTotalMix 側のどちらで値が変わっても表示が同期される。

## 4. 機能仕様

### 4.1 フェーダーダイヤル(Encoder アクション)

代表ユースケース: **TotalMix FX Hardware Outputs の Main フェーダー操作**。

| 操作 | SDK イベント | 動作 |
|---|---|---|
| 回転 | `dialRotate`(`ticks`: 回転量, 符号=方向) | フェーダー値を増減。1 チック = 設定可能なステップ(既定 0.01 = 1%)。値は **Float32 0.0–1.0** で送信 |
| 押しながら回転 | `dialRotate`(`pressed: true`) | 微調整モード(1 チック = 0.001) |
| 押下 | `dialDown` / `dialUp` | 設定可能: ①0 dB リセット ②Mute トグル ③ミュート(押している間) |
| タッチ | `touchTap`(`hold: false`) | Mute トグル |
| ロングタッチ | `touchTap`(`hold: true`) | 既定値(ユーザー設定のプリセット値)へジャンプ |

- manifest の `Encoder.TriggerDescription`(Rotate / Push / Touch / LongTouch)に上記を記載し、Stream Deck アプリの UI ヒントに表示する。
- タッチストリップ表示は組み込みレイアウト **`$B1`**(icon + title + value + bar)をベースに `setFeedback({title, value, indicator})` で更新。Mute 時の赤色化など色制御が必要になった時点でカスタムレイアウト JSON(`bar` の `bar_fill_c` 指定)に切り替える。
- 表示更新は **最大 10 回/秒** の制限があるため、回転中のフィードバックはコアレス(最新値のみ送信)する。

- **ターゲット指定**(Property Inspector):
  - 「Main アウト(`/1/mastervolume`)」をプリセットとして最上位に表示(ワンクリック設定)。バス/バンク状態に依存しないため最も堅牢。
  - 任意の出力チャンネル: デバイス定義(UCX II / UCX / Babyface Pro)からストリップを選択 → **バンク固定戦略**(§5)のもとで `/1/volume{ストリップ#}` へマッピング。
  - 上級者向け「カスタム OSC アドレス+型」モード(他の OSC 対応アプリにも流用可能)。
- **表示(タッチストリップ)**: タイトル(チャンネル名)+ dB 値(TotalMix の `*Val` 文字列フィードバック)+ 横バー(0–100%)。詳細は [ICON-DESIGN.md](ICON-DESIGN.md)。
- **フィードバック**: TotalMix からの現在値受信で表示を更新。TotalMix 側でフェーダーを動かした場合も追従する。

### 4.2 Mute キー(Keypad アクション)

- 押下で対象チャンネルの Mute をトグル。アドレスは **`/1/mute/1/{ストリップ#}`**(f 1.0=ON / 0.0=OFF)。バンク固定戦略(§5)により番号は安定する。
- manifest の 2 States(off/on)でアイコン切替。**`DisableAutomaticStates: true`** を指定し、押下時の自動トグルではなく **TotalMix からのフィードバックを正**として `setState()` で状態同期する(TotalMix 側で解除された場合もキー表示が戻る)。
- **Main アウトには専用 Mute アドレスが存在しない**(RME 公式回答)。Main 用プリセットとして次の2方式を提供: ①`/1/mainDim` トグル(TotalMix 側の Dim 減衰量設定に依存。トグルのみのためフィードバックで状態追跡) ②`/1/mastervolume` を 0.0 にして元値を復元する疑似 Mute(Fader Dim の 100% 版)。

### 4.3 Fader Dim キー(Keypad アクション)

「音量を約10%に抑える」= **約 -20 dB の減衰**(電力比 1/100・振幅比 1/10 ≒ 聴感上「10%程度の音量」)をワンタッチでトグルする。モニターセクション用語の **Dim** に相当する機能だが、TotalMix 本来の Dim(`/1/mainDim`)が Main アウト専用なのに対し、本アクションは**任意チャンネルのフェーダーをプラグイン側で減衰・復元する汎用版**のため「Fader Dim」と命名する。

- **動作**:
  1. ON: 現在のフェーダー値を記憶 → 減衰後の値を Float32 で送信。
  2. OFF: 記憶していた元の値を復元送信。
- **減衰方式**(Property Inspector で選択):
  - `dB 指定`(既定 -20 dB): フェーダーテーパー(Float 1.0 = +6 dB、0 dB ≈ 0.8172、−∞ = 0.0)の実測検証済み近似式(fgimian/totalmix-volume-control 由来、対応表 §4 参照)で dB → Float 変換して送信。表示 dB は TotalMix の `…Val` フィードバックを正とするため近似誤差は表示に影響しない。
  - `倍率指定`(フェーダー値に係数を乗算、簡易モード)
- **競合処理**: Dim 中に TotalMix 側やダイヤルで値が変更された場合は Dim 状態を解除扱いにする(記憶値を破棄し、表示を OFF に戻す)— 「戻したら爆音」事故を防ぐ。
- 2 States でアイコン切替(OFF: 無彩色 / ON: オレンジ点灯)。

### 4.4 設定画面(Property Inspector)

- **sdpi-components v4**(Elgato 公式推奨の Web Components ライブラリ、ローカル同梱)で構築。
- 共通(グローバル設定): TotalMix ホスト(既定 127.0.0.1)/送信ポート/受信ポート。sdpi の `global` 属性で **Global Settings** に保存し、全アクションで共有。接続設定はプロファイルにエクスポートされる Action Settings に置かない。
- アクション個別(Action Settings): ターゲットチャンネル、ステップ量、Dim 量、押下時動作、表示名。
- チャンネル選択は `datasource` ドロップダウン(`sendToPlugin`/`sendToPropertyInspector`)で実装し、デバイス定義(UCX II / UCX / Babyface Pro)からチャンネル一覧を動的生成する。
- 既存 OSC Remote の設定画面(スクリーンショット)を参考に、**プリセット選択 → 詳細カスタム**の2段構成にし、初回設定の敷居を下げる。

## 5. OSC プロトコル実装方針

調査(2026-08-08、公式マニュアル+RME スタッフ回答+動作実績実装のクロス検証)に基づく確定方針。詳細なアドレス対応と出典は [OSC-ENDPOINTS.md](OSC-ENDPOINTS.md) に分離。

- **送信は必ず Float32(型タグ `,f`)**。TotalMix は Int 引数を黙って無視する(既存 OSC Remote プラグインが動かない直接原因であることを確認済み)。真偽系(Mute 等)も Float 0.0 / 1.0 で送る。トグル系ボタン(Dim 等)は f 1.0 のみ送信。
- **バンク固定戦略**: 起動時に ①`/1/busOutput 1.0` ②`/setBankStart 0` を送信し、TotalMix 側の「バンクあたりフェーダー数」をデバイスの出力ストリップ数以上(対象3機種は最大10ストリップのため既定8では不足 → **16 を推奨設定として案内**)にすることで、`/1/volume{n}` / `/1/mute/1/{n}` の n を「Output バス先頭からの絶対ストリップ番号」として安定運用する。ドリフト検出時(フィードバックの `labelSubmix`/バス状態が想定と異なる場合)は同シーケンスを再送して復旧する。
- **受信(フィードバック)**: TotalMix → プラグインのパケットは **OSC `#bundle` でラップされる**ためデコーダは bundle 対応必須。`/1/volume{n}` / `/1/mastervolume`(Float)と `…Val`(String, dB 表記)、`trackname{n}`、トグル状態を `OscState` にキャッシュし、各アクションの表示(`setFeedback` / `setState`)へ反映する。
- **起動時同期**: バス再選択(`/1/busOutput 1.0`)送信でバンク全体の状態ダンプが返ることを利用して全値リフレッシュする。
- **エコーバック防止**: TotalMix が返す Float は送信値より約0.1%高く丸められるため、**受信値をそのまま再送信しない**(音量クリープ事故の既知バグパターン)。送信は常にプラグイン内部の目標値から生成する。
- **トグルのみの制約**: `/1/mainDim` `/1/globalMute` 等は TotalMix 1.7.0 以降トグル動作のみ。ON/OFF を保証するにはフィードバックで現在状態を追跡してから必要時のみトグルを送る。
- **将来対応**: TotalMix FX 2.1 アルファで導入中の「**Global OSC**」プロトコル(ステートレス絶対アドレス+実 dB 値)が正式化されたら、抽象化した OSC 層のバックエンドとして追加する(バンク固定戦略が不要になる)。v1 は安定版のクラシックプロトコルで実装する。

## 6. アセット要件(アイコン)

デザイン仕様・ドラフト SVG は [ICON-DESIGN.md](ICON-DESIGN.md) 参照。書き出しサイズ一覧(SDK 公式ドキュメントで確認済み):

| 用途 | サイズ(@1x / @2x) | 形式 | 制約 |
|---|---|---|---|
| プラグインアイコン(`Icon`) | 256×256 / 512×512 | PNG のみ | Marketplace 用アプリアイコン |
| カテゴリアイコン(`CategoryIcon`) | 28×28 / 56×56 | SVG/PNG | **白モノクロ・透過背景**(テーマ対応はアプリ側) |
| アクションリストアイコン(各 Action の `Icon`) | 20×20 / 40×40 | SVG/PNG | **白モノクロ・透過背景** |
| キー画像(`States[].Image`) | 72×72 / 144×144 | SVG 推奨/PNG/GIF | フルカラー可 |
| エンコーダーアイコン(`Encoder.Icon`) | 72×72 / 144×144 | SVG/PNG | ダイヤルスタックに表示 |
| エンコーダー背景(`Encoder.background`) | 200×100 / 400×200 | 画像 | タッチストリップ1スロット |
| タッチストリップ描画キャンバス | 200×100 px | レイアウト JSON | タッチ対象は最小 35×35 px、更新 ~10回/秒 |

※ カラーで作成済みのノブアイコン等はキー画像・エンコーダーアイコン用。**アクションリスト/カテゴリ用には白モノクロ版を別途用意する**(ICON-DESIGN.md 参照)。旧仕様の 288×288 ストアアイコンは廃止済みのため作らない。

## 7. リポジトリ構成(実装フェーズ)

```
TotalMix-OSC-Remote/
├─ docs/                     … 本計画書・対応表・デザイン仕様
├─ assets/                   … SVG マスター/モックアップ
├─ src/
│  ├─ plugin.ts              … エントリポイント
│  ├─ actions/               … fader-dial / mute-key / fader-dim-key
│  ├─ osc/                   … OscClient(UDP)/ encoder / decoder / state
│  └─ totalmix/              … アドレスマップ・デバイス定義(UCX II / UCX / Babyface Pro)
├─ com.rimtty.totalmix-osc-remote.sdPlugin/
│  ├─ manifest.json
│  ├─ bin/                   … ビルド成果物
│  ├─ imgs/                  … 書き出し済み PNG/SVG
│  ├─ layouts/               … タッチストリップ カスタムレイアウト JSON
│  └─ ui/                    … Property Inspector HTML
└─ package.json
```

## 8. マイルストーン

| # | 内容 | 完了条件 |
|---|---|---|
| M0 | 計画確定(本書+対応表+デザイン) | ドキュメントレビュー完了 |
| M1 | OSC 通信 PoC | Node スクリプトから `/1/mastervolume` に Float 送信し TotalMix の Main フェーダーが動く。フィードバック受信確認 |
| M2 | ダイヤル MVP | Stream Deck + のダイヤルで Main フェーダー操作+タッチストリップに dB 表示 |
| M3 | Mute / Fader Dim キー | 2 状態トグル+フィードバック同期 |
| M4 | 設定画面+任意チャンネル対応 | プリセット/カスタムターゲット設定 |
| M5 | アイコン最終化+パッケージング | `.streamDeckPlugin` 配布物、実機3デバイス系での動作確認 |

## 9. リスクと対応

| リスク | 対応 |
|---|---|
| バンク相対アドレスのため、TotalMix 側のバンク/ビュー状態に依存して対象チャンネルがずれる | `/setBankStart 0` + `/1/busOutput 1.0` + バンクサイズ16設定による**バンク固定戦略**で解消(§5)。フィードバックでドリフト検出時は再送で復旧 |
| モノ/ステレオ設定・非表示チャンネルでストリップ番号がずれる | デバイス定義+設定画面でのモノ設定反映。非表示チャンネル(Channel Layout)はリモートからも消える仕様のため FAQ に明記 |
| フェーダーテーパー(0–1 ↔ dB)が RME 非公開 | dB 表示は TotalMix の `…Val` フィードバック文字列を正とし、Fader Dim の dB 指定は実測検証済み近似式(0 dB ≈ 0.8172)で実装 |
| 受信値の再送信による音量クリープ(TotalMix の丸め誤差) | 送信値は常に内部目標値から生成し、受信値は表示専用にする(§5) |
| OSC Remote Controller 枠(最大4)の競合(TouchOSC 等との併用) | 設定画面でポートを変更可能にする。TotalMix 側で別 Index(1–4)に割り当ててもらう |
| Stream Deck 無印(ダイヤル無し)ユーザー | キーアクションのみでも成立する構成にする(フェーダー上下キー(+1%/-1%)の追加を v1.1 で検討) |
| クラシックプロトコルの根本的な状態依存性 | OSC 層を抽象化し、正式化され次第「Global OSC」(ステートレス・実 dB)へ移行可能にする |

## 10. 付録: manifest.json ドラフト

SDK 調査結果(2026-08-08、公式ドキュメント確認済み)に基づくドラフト。

```jsonc
{
  "$schema": "https://schemas.elgato.com/streamdeck/plugins/manifest.json",
  "UUID": "com.rimtty.totalmix-osc-remote",
  "Name": "TotalMix OSC Remote",
  "Version": "0.1.0.0",
  "Author": "rimtty",
  "Description": "Control RME TotalMix FX via OSC — true Float32 faders, mute and attenuation.",
  "Icon": "imgs/plugin/icon",                  // 256x256 + 512x512 PNG
  "Category": "TotalMix OSC Remote",
  "CategoryIcon": "imgs/plugin/category-icon", // 白モノクロ 28/56
  "CodePath": "bin/plugin.js",
  "SDKVersion": 3,
  "Nodejs": { "Version": "24", "Debug": "enabled" },
  "Software": { "MinimumVersion": "6.9" },
  "OS": [
    { "Platform": "windows", "MinimumVersion": "10" },
    { "Platform": "mac", "MinimumVersion": "12" }
  ],
  "Actions": [
    {
      "UUID": "com.rimtty.totalmix-osc-remote.fader-dial",
      "Name": "Fader Dial",
      "Icon": "imgs/actions/list-dial",        // 白モノクロ 20/40
      "Controllers": ["Encoder"],
      "Encoder": {
        "layout": "layouts/fader.json",        // $B1 相当+色制御のカスタム
        "Icon": "imgs/actions/dial-fader",     // 72/144
        "TriggerDescription": {
          "Rotate": "Volume",
          "Push": "Reset / Mute (configurable)",
          "Touch": "Mute",
          "LongTouch": "Jump to preset"
        }
      },
      "States": [ { "Image": "imgs/actions/dial-fader" } ]
    },
    {
      "UUID": "com.rimtty.totalmix-osc-remote.mute-key",
      "Name": "Mute",
      "Icon": "imgs/actions/list-mute",
      "Controllers": ["Keypad"],
      "DisableAutomaticStates": true,          // TotalMix フィードバックを正とする
      "States": [
        { "Image": "imgs/actions/key-mute-off", "Name": "Unmuted" },
        { "Image": "imgs/actions/key-mute-on",  "Name": "Muted" }
      ]
    },
    {
      "UUID": "com.rimtty.totalmix-osc-remote.fader-dim-key",
      "Name": "Fader Dim",
      "Icon": "imgs/actions/list-fader-dim",
      "Controllers": ["Keypad"],
      "DisableAutomaticStates": true,
      "States": [
        { "Image": "imgs/actions/key-fader-dim-off", "Name": "Normal" },
        { "Image": "imgs/actions/key-fader-dim-on",  "Name": "Dimmed" }
      ]
    }
  ]
}
```

## 11. 調査状況

- [x] TotalMix FX OSC のアドレス表(mute/solo パターン、main 系、バンク制御、リフレッシュ手順)— 2026-08-08 調査済み、[OSC-ENDPOINTS.md](OSC-ENDPOINTS.md) に反映
- [x] フィードバックの挙動と全値同期(バス再選択でバンク全体ダンプ、`#bundle` ラップ)— 反映済み
- [x] フェーダーテーパー(0 dB ≈ 0.8172、実測検証済み近似式)— 反映済み
- [x] UCX II / UCX / Babyface Pro の出力チャンネル構成 — [OSC-ENDPOINTS.md](OSC-ENDPOINTS.md) §5 に反映
- [x] Stream Deck SDK のレイアウト ID・イベント仕様・アセットサイズ — 本書に反映
- [ ] 実装前の最終照合: 公式 OSC 対応表 `osc_table_totalmix_new.zip`(xls)のダウンロード確認(未実施。実装が実機で動作したため優先度低)
- [x] 実機検証(2026-08-08 完了): UCX II + Stream Deck + で全アクション確認 — ダイヤル物理回転で Main フェーダー追従、タッチストリップ dB 表示が TotalMix 実値と一致、Mute/Fader Dim キーの双方向同期、-20 dB 減衰と復元
