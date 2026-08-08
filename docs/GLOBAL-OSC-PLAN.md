# Global OSC バックエンド対応 検討ドキュメント

調査日: 2026-08-09。出典: RME 公式プロトコル仕様書 `OSCProtocoll_260721.ods`(globalosc_protocol_b2.zip、全シート解析済み)、RME フォーラム(スタッフ MC の投稿)、コミュニティ実装 [totalreaper](https://github.com/acklin83/totalreaper)。凡例: **[公式]** / **[RME]** / **[実績]** は [OSC-ENDPOINTS.md](OSC-ENDPOINTS.md) と同様。

## 1. 現状サマリー(2026-08-09 時点)

- **TotalMix FX 2.1 はパブリックベータ**(Beta 4, 2026-08-06)。アルファは 2026-07-18 に卒業し、Global OSC が 2.1 の目玉機能として公式アナウンスされている **[RME]**
- **公式プロトコル仕様書が存在**: `globalosc_protocol_b2.zip` 内の ODS 表(全アドレス+送受信方向+ステレオ L/R フラグ+フェーダーカーブの C コード)**[公式]**
- TotalMix FX 2.x は「全 RME インターフェース対応のスタンドアロンアプリ」(要 Windows 10+/D3D12 GPU、macOS 10.15+/Metal)。UCX II / Babyface Pro での動作報告あり **[公式/実績]**
- **RME 公式の Stream Deck プラグイン PoC が存在**(v0.11、Global OSC ベース、ポート 7008/9008)**[RME]** — 本プロジェクトとは別物で機能は限定的だが、「Global OSC を Stream Deck から叩く」構成自体は RME 公認の使い方といえる

## 2. Global OSC の要点(公式仕様より)

### 2.1 本プラグインに関係するアドレス

| 用途 | アドレス | 型/値 | 備考 |
|---|---|---|---|
| 出力フェーダー | `/output/<ch>/volume` | f **実 dB**(-300=−∞) | ch は **0 始まり・ステレオペア左ch番号** |
| 〃(リニア) | `/output/<ch>/faderlin` | f 0..1 | 公式カーブあり(下記) |
| **出力 Mute** | `/output/<ch>/mute` | f 0/1 | **Main Out も通常の出力ストリップとして Mute 可能**(クラシックの「Main に Mute なし」問題が解消) |
| センド(サブミックス明示) | `/mix/in/<in>/<out>/fader` `/mix/pb/<pb>/<out>/fader` | f 実 dB | **宛先サブミックスをアドレスで指定**(クラシックの「現在のサブミックス依存」が解消) |
| センド Mute 相当 | `/mix/.../solo`, node fader −300 | | ノード単位 solo あり |
| チャンネル名 | `/input|playback|output/<ch>/name` | s 双方向 | trackname 相当。設定も可能 |
| Dim | `/controlroom/dim` / `/controlroom/dimreduction` | f | **Dim 量も OSC で設定可能** |
| Main アサイン | `/controlroom/mainout` | f(ch index) | Main がどの出力かを取得/変更できる → 「Main」ターゲットの実体解決に使える |
| リフレッシュ | `/sendall`(2=有効ノードのみ)/ `/sendchan/<bus>/<ch>` / `/sendmix` / `/sendsettings` / `/sendstate` | (f) | オンデマンド全量/部分ダンプ **[公式]** |
| レベルメーター | `/level/in|pb|out/<ch>` | f dB | 変化時のみ送信(将来のメーター表示に利用可) |
| ステータス | `/status/device` `/status/connection` `/status/dsp` | s/f | 接続監視に使える |
| ミュート/ソログループ | `/mutegroup/<n>` 等(1始まり) | f | グリッド逆順問題なし |
| スナップショット | `/snapshot/load/<n>`(状態: 0/2=active/3=changed を送信) | | 将来機能候補 |

### 2.2 プロトコル規約 **[公式]**

- チャンネルは **0 始まり**。ステレオペアは左ch番号で代表(L/R 別パラメータのみ右=左+1 で指定)
- 値は float のほか int / OSC T・F も受理。トリガ系 `(f)` は **値 < 0.5 を無視**
- フィードバックは **push 型**(変化を即送信、`#bundle` ラップ)。購読手続きは無く、必要時に `/send*` で要求
- `faderlin` の 0..1↔dB カーブは**公式 C コードが仕様書に同梱** — 現行実装の実測近似式(fgimian 由来)と**同一の式**であることを確認(上段 `dB = pos×0.0320855615 − 26.8235294118`、下段2次式)。つまり現行 taper.ts はそのまま公式準拠になる
- 設定: OSC タブの Compatibility で「Global OSC」を選択 → Details ボタンで詳細設定(起動時全量送信、リニアスケール送信、非表示チャンネルへの受信、再送オプション、**帯域リミッター(500 kB/s 推奨)[RME]**)
- **「Follow Submix は無効にすべし」[公式]**。クラシックとの併用はコントローラー枠(1–4)ごとの Compatibility 設定なので**別枠併用が想定される**(公式明文は無し、RME 公式プラグインは衝突回避に 7008/9008 を使用)

### 2.3 注意点・既知の癖

- **エコーバック不整合 [実績]**: 自分の変更のエコーが `/output/.../volume` では返るが `/input/.../mute` では返らない等の非対称が報告されている。再送オプションで緩和可能だが「ピンポン送信」リスクの公式警告あり → **自分の送信値はローカル状態を正とし、エコーに依存しない設計**(現行と同方針)が安全
- 非表示チャンネル(Channel Layout)は Global OSC にも適用。「receive to hidden channels」オプションで受信は可能
- ステータスは約1パラメータ/秒。メーターは変化時のみ
- ベータゆえの細かい修正が続いている(b2 で 255.255.255.255 ブロードキャストバグ修正等)

## 3. 本プラグインへの影響(何ができるようになるか)

| # | 改善/新機能 | 現行(クラシック) | Global OSC |
|---|---|---|---|
| 1 | **バス/バンク状態管理の全廃** | ensureBus+setBankStart+バス別キャッシュ | アドレスが絶対なので不要。複数ダイヤルが異なる行を**同時操作しても競合しない** |
| 2 | **実 dB での送受信** | 0..1 Float+近似式 | `/output/<ch>/volume` に dB 直書き。Dim の「-20 dB」が厳密に |
| 3 | **Main Out の本物の Mute** | Dim で代替 | `/controlroom/mainout` で Main の実チャンネルを解決 → `/output/<ch>/mute` |
| 4 | **サブミックス指定センド**(新機能) | 「現在のサブミックス」依存 | `/mix/in|pb/<src>/<dst>/fader` で「Mic 1 → Phones のセンド」を固定ターゲット化できる |
| 5 | **チャンネル名の双方向同期** | trackname 受信のみ(バス切替が必要) | `/name` を直接読める。`/sendchan` で個別リフレッシュ |
| 6 | Dim 量の制御 | TotalMix 側設定依存 | `/controlroom/dimreduction` で PI から設定可能 |
| 7 | 接続状態表示 | なし | `/status/connection` でタッチストリップに接続警告を出せる |
| 8 | 将来: メーター表示/スナップショットキー | 対象外 | `/level/*` `/snapshot/load/<n>`(状態通知つき)が利用可能 |

## 4. アーキテクチャ方針

```
src/osc/
  backend.ts        … TargetRef(row/ch/submix)と操作の抽象 IF
  classic/client.ts … 現行実装(v0.2 のまま。安定版ユーザー向け)
  global/client.ts  … 新実装(ステートレス、dB 直接)
  taper.ts          … faderlin 用として両バックエンドで共用(公式カーブと同一)
```

- **Backend IF(案)**: `setVolumeDb(ref, db)` / `nudgeVolume(ref, deltaDb)` / `setMute(ref, on)` / `getState(ref)` / `onChange(ref, cb)` / `listChannels(row)` / `refresh()`
- **プロトコル選択**: グローバル設定に `protocol: "classic" | "global"`(既定 classic)。TotalMix 2.1 未満のユーザーに影響を出さない。`/status/device` への応答有無で「Global OSC が話せるか」の自動検出も可能(接続テストボタンとして PI に出す)
- **設定マッピング**: 既存の bus/strip(1始まり・ストリップ番号)→ Global の 0始まり・モノch番号へは、`/name` ダンプから構築するチャンネル表で変換(ステレオ判定は `/…/stereo` を読む)
- **エコー対策**: 送信値はローカル正。受信は「外部変更の検出」にのみ使用(現行 Fader Dim の設計を踏襲)

## 5. マイルストーン(改訂)

| # | 内容 | 完了条件 | 備考 |
|---|---|---|---|
| G0 | ✅ 仕様調査+本書確定 | 本書 | 公式仕様書を入手済み |
| G1 | 実機 PoC | `/output/<ch>/volume` への dB 送信と `/sendall` ダンプ受信を実測(tools/poc に Global 版追加) | **要: TotalMix FX 2.1 Beta のインストール(ユーザー判断)**。現行 1.9x と併存不可のため、オーディオ環境への影響を了解の上で |
| G2 | ✅ Backend 抽象化リファクタ(2026-08-09 完了) | 既存3アクションが Backend IF 経由で動作(クラシックのまま回帰なし) | `src/osc/backend.ts`(IF)+ `src/osc/classic/client.ts`。アクションはアドレス/バスを知らない |
| G3 | GlobalBackend 実装 | 3アクション+チャンネル一覧+Main 解決が Global OSC で動作 | 「実験的」フラグ付きで出荷 |
| G4 | 新機能 | サブミックス指定センド、Dim 量設定、接続状態表示 | Global 選択時のみ有効化 |

## 6. リスクと判断材料

| リスク | 評価 |
|---|---|
| 2.1 がベータ | 正式リリースまで Global バックエンドは「実験的」扱い。クラシックを既定に維持すれば既存ユーザーに影響なし |
| TotalMix 2.x の動作要件(D3D12/Metal) | 古い環境のユーザーはクラシックのまま。両対応の意義がここにある |
| プロトコル微修正の継続 | 仕様書の changelog を追跡。アドレス定義は `global/addresses.ts` に集約して差分吸収 |
| RME 公式 Stream Deck プラグインとの競合 | 公式 PoC(v0.11)は機能限定(本プラグインのダイヤル/Dim/フィードバック統合に相当する機能なし)。差別化は明確だが、公式の今後の拡張は注視 |

## 7. 推奨

**G2(Backend 抽象化)から着手するのが低リスク**。TotalMix 2.1 の導入判断を待たずに進められ、コード品質も上がる。G1(実機 PoC)はユーザーが 2.1 Beta を導入するタイミングで実施し、その結果をもって G3 の仕様を最終確定する。

## 出典

- 公式仕様書: [globalosc_protocol_b2.zip](https://www.rme-audio.de/downloads/globalosc_protocol_b2.zip)(`OSCProtocoll_260721.ods`、"OSC-Commands TotalMix FX 2.1 beta 2 'Global OSC'")
- [2.1 アルファスレッド(id=43075)](https://forum.rme-audio.de/viewtopic.php?id=43075) / [2.1 ベータスレッド](https://forum.rme-audio.de/viewtopic.php?pid=253410)
- TotalMix FX 2.1 Beta 4: [Windows](https://www.rme-audio.de/downloads/tmfx_win_21b4.zip) / [Mac](https://www.rme-audio.de/downloads/tmfx_mac_21b4.zip)
- RME 公式 Stream Deck プラグイン PoC: tmfx21_streamDeckPlugin_011.zip(ポート 7008/9008)
- コミュニティ実装: [totalreaper](https://github.com/acklin83/totalreaper)(v0.2.1、実測レンジのドキュメントあり)
