# TotalMix FX OSC エンドポイント対応表

対象デバイス: Fireface UCX II / Fireface UCX / Babyface Pro (FS)
調査日: 2026-08-08。出典は文末。凡例: **[公式]** = RME マニュアル/公式ドキュメント、**[RME]** = RME スタッフ(MC)のフォーラム回答、**[実績]** = 動作実績のある OSS 実装/コミュニティ検証。

> 最終的なアドレス単位の仕様確認には、公式 OSC 対応表 `osc_table_totalmix_new.zip`(全マニュアルからリンクされている xls)を実装前に一度ダウンロードして照合すること。

## 1. OSC 接続設定(TotalMix FX 側)

| 項目 | 値 | 備考 |
|---|---|---|
| 有効化(1) | メニュー Options → **Enable MIDI/OSC Control** | これが OFF だと OSC 設定が有効でも動かない **[公式]** |
| 有効化(2) | Options → Settings → **OSC タブ** → Index 1–4 を選び **In Use** をチェック | リモートコントローラー枠は最大4 **[公式]** |
| 受信ポート(TotalMix が受け取る) | 既定/慣例 **7001**(コントローラー2は 7002)。「典型値は 7001 または 8000」 | プラグイン → TotalMix **[公式/実績]** |
| 送信ポート(TotalMix が返す) | 既定/慣例 **9001**(コントローラー2は 9002)。「典型値は 9001 または 9000」 | TotalMix → プラグイン(フィードバック)**[公式/実績]** |
| Remote Control IP | プラグイン側の IP(ローカルなら 127.0.0.1)。「ホスト名より IP のほうが確実」 | **[公式]** |
| バンクあたりフェーダー数 | **8(既定)/ 12 / 16 / 24 / 32 / 48** | `/1/volume{n}` の n の範囲を決める。無線環境では大バンクは非推奨 **[公式]** |
| Send Peak Level Data | 任意 | レベルメーターのフィードバック送信 **[公式]** |
| Lock Remote to submix | 任意 | このコントローラーを指定サブミックスに固定(マルチリモート環境の事故防止)**[公式]** |
| Compatibility (Mode) | 既定の拡張コマンドセット(1.96+)を使用 | 「TotalMix 1.90」互換モードと、新しい「**Global OSC**」(§6)がある **[公式]** |

## 2. OSC アドレス表(クラシックプロトコル)

**TotalMix へ送る値はすべて Float32(型タグ `,f`)。Int は黙って無視される。** これが既存 OSC Remote プラグイン(Int しか送れない)が動作しない直接原因。**[実績]**

### 2.1 ページ1(`/1/…`)— ミキサーバンクビュー

| 機能 | アドレス | 型/値 | 備考 |
|---|---|---|---|
| **Main アウト音量** | `/1/mastervolume` | f 0.0–1.0 | Control Room の Main フェーダー **[実績]** |
| Main アウト音量表示 | `/1/mastervolumeVal` | s(フィードバックのみ) | 例 `"-12.0 dB"` |
| バンク内フェーダー | `/1/volume1` … `/1/volumeN` | f 0.0–1.0 | N = バンク相対ストリップ番号(1〜バンクサイズ)。対象行は直前のバス選択に従う |
| フェーダー値表示 | `/1/volume{n}Val` | s(フィードバックのみ) | dB 文字列 |
| パン | `/1/pan{n}` | f 0.0–1.0 | 0=L, 0.5=C, 1=R **[実績]** |
| **Mute** | `/1/mute/1/{n}` | f 1.0=ON / 0.0=OFF | トグルマトリクス形式(行 `/1/`)**[実績]** |
| Solo | `/1/solo/1/{n}` | f 1.0 / 0.0 | **[実績/RME]** |
| ストリップ選択 | `/1/select/1/{n}` | f | フェーダーグループ的な選択 **[実績]** |
| チャンネル名 | `/1/trackname{n}` | s(フィードバックのみ) | |
| サブミックス名 | `/1/labelSubmix` | s(フィードバックのみ) | |
| バス切替 | `/1/busInput` / `/1/busPlayback` / `/1/busOutput` | f **1.0** を送信 | フィードバックはアクティブなバスに 1.0 を返す **[実績]** |
| バンク移動 | `/1/bank-` / `/1/bank+` | f 1.0(モーメンタリ) | |
| トラック移動 | `/1/track-` / `/1/track+` | f 1.0 | |
| グローバル Mute/Solo | `/1/globalMute` / `/1/globalSolo` | f 1.0 | **1.7.0 以降トグル動作のみ**(ON/OFF 指定不可)**[実績]** |
| Trim モード | `/1/trim` | f 1.0 | トグルのみ |
| **Dim** | `/1/mainDim` | f 1.0 | トグル。状態はフィードバックで追跡 |
| Mono | `/1/mainMono` | f 1.0 | トグル |
| Speaker B | `/1/mainSpeakerB` | f 1.0 | トグル |
| Recall | `/1/mainRecall` | f 1.0 | |
| Talkback | `/1/mainTalkback` | f 1.0 | |
| External Input | `/1/mainExtIn` | f 1.0 | |
| Mute FX | `/1/mainMuteFx` | f 1.0 | |
| レベルメーター | `/1/level{n}Left` / `/1/level{n}Right` | (フィードバックのみ) | Send Peak Level Data 有効時のみ **[実績]** |

> **Main アウト専用の Mute アドレスは存在しない。** RME 公式の回避策は「Dim の減衰量を最大にする」**[RME]**。本プラグインでは「mastervolume を 0.0 にして元値を復元する」方式(Fader Dim の減衰率 100% 版)も選択肢として提供する。

### 2.2 プレフィックスなし特殊コマンド(絶対アドレッシング)

| コマンド | 引数 | 動作 |
|---|---|---|
| `/setSubmix x` | f(0始まり・**モノ換算**のチャンネル番号) | サブミックス(Hardware Output)を直接選択。例: UCX の Phones 7/8 → `6.0` **[RME/実績]** |
| `/setBankStart x` | f | OSC バンクの先頭チャンネルを直接設定 **[RME]** |
| `/setOffsetInBank x` | f | バンク内の単一チャンネル選択(ページ2の対象指定)**[RME]** |

典型シーケンス: ①`/1/busOutput 1.0` → ②`/setBankStart 0` → ③`/1/volume{n}` 送信。**バンク相対アドレスの不安定さはこの組で解消できる**(本プラグインの基本戦略。計画書 §5 参照)。

### 2.3 ページ2(`/2/…`)— 選択チャンネル詳細(v1 スコープ外・参考)

`/2/volume`, `/2/pan`, `/2/gain`, `/2/mute`, `/2/solo`, `/2/cue`, `/2/phase`, `/2/phantom`(48V), `/2/stereo`, `/2/loopback`, EQ/LowCut/Comp/Autolevel 系, `/2/trackname`, 各種 `…Val`(フィードバック)など。対象チャンネルは `/setOffsetInBank` 等で指定。**[実績]**

### 2.4 ページ3(`/3/…`)— グループ/スナップショット/FX(v1 スコープ外・参考)

`/3/snapshots/{row}/1`(8個), `/3/muteGroups/{row}/1`, `/3/soloGroups/{row}/1`, `/3/faderGroups/{row}/1`(各4個), `/3/reverb*`, `/3/echo*`, `/3/record*`, `/3/undo`, `/3/redo`。⚠ グリッド系は **行番号が逆順**(TouchOSC multipush 由来: ミュートグループ1 = `/3/muteGroups/4/1`)。**[実績]**

※ ページ4(`/4/…`)は存在しない(公式表の照合でも要確認だが、既知の実装・文書に一切登場しない)。

## 3. フィードバック仕様

- TotalMix は設定された Remote IP : 送信ポートへ UDP で現在値を返す: フェーダー Float、`…Val` dB 文字列、`trackname{n}`、`labelSubmix`、各トグル状態、(有効時)レベルデータ。**[実績]**
- **バンク/サブミックス切替時には表示バンク全体の包括的な状態ダンプが送られる。** 全値リフレッシュしたい場合はバス再選択(`/1/busOutput 1.0` 等)か `/setSubmix` を送ればよい。⚠ サブミックス選択でバンクが先頭にリセットされる点に注意。**[実績]**
- **TotalMix → ホストのパケットは OSC `#bundle` でラップされる**。受信側は bundle 解析必須。**[実績]**
- ⚠ **エコーバック事故**: TotalMix が返す Float は送信値よりわずかに丸められて(約0.1%高く)返る。受信値をそのまま再送信すると音量がじわじわ上がるバグになる。受信値の再送信はしないこと。**[実績]**
- 非表示チャンネル(Options → Channel Layout)は**リモートからも見えなくなる**。対応表のインデックスずれ要因として FAQ に記載する。**[公式/RME]**

## 4. フェーダーテーパー(Float ↔ dB)

- フェーダー範囲: **−∞ 〜 +6 dB**。Float 1.0 = +6 dB、**0 dB ≈ 0.8172**(UI スケールでは 0–100 中 82 が 0 dB)。**[実績]**
- dB 値の公式な取得手段は `…Val` フィードバック文字列のみ。Float↔dB の変換式は RME 非公開だが、実測検証済みの近似式がある(fgimian/totalmix-volume-control, MIT):

```text
faderPos = value × 1023
上段(faderPos ≥ 649, ≈ −6 dB 以上): dB = faderPos × 0.0320855615 − 26.8235294118
下段:                                dB = −faderPos²/11033 + faderPos × 0.1497326203 − 65.0
逆変換: value = dB ≥ −6 ? ((dB + 26.8235294118) / 0.0320855615) / 1023
                        : (826.0 − √(−34869.0 − 11033.0×dB)) / 1023
検証点: 1.0 → +6.0 dB / 0.8172 → 0 dB / 0.634 → −6 dB / 0.0 → −∞
```

本プラグインでは表示は `…Val` フィードバックを正とし、Fader Dim の dB 指定計算にのみこの近似式を使う(誤差は表示側で自動補正される)。

## 5. デバイス別 出力チャンネル構成と OSC インデックス

OSC バンクのインデックスは**モノチャンネルではなくストリップ(ステレオペア=1本)を数える**。AN1/2 がステレオなら出力ストリップ1、AN3 はストリップ2。AN1/AN2 をモノに分割するとAN3 はストリップ3になる。**モノ/ステレオ設定でインデックスがずれる**ため、プラグインはデバイス定義+ユーザーのモノ設定を反映してインデックスを計算する。**[実績]**

一方 `/setSubmix` は**0始まり・モノ換算**(ステレオでも左chの番号)。混同注意。

### 5.1 Fireface UCX II(20 出力)**[公式]**

物理順: Analog 1–6(背面ライン)→ Phones 7/8(前面)→ SPDIF coax 9/10 → AES (XLR) 11/12 → ADAT 13–20 ※ADAT は 96k で 4ch、192k で 2ch に減少

| ストリップ #(全ステレオ時) | 表示名 | 物理端子 | モノ換算 ch | `/setSubmix` 値 |
|---|---|---|---|---|
| 1 | AN 1/2 | ライン出力 1/2(通常 Main Out) | 1–2 | 0 |
| 2 | AN 3/4 | ライン出力 3/4 | 3–4 | 2 |
| 3 | AN 5/6 | ライン出力 5/6 | 5–6 | 4 |
| 4 | PH 7/8 | ヘッドフォン出力 | 7–8 | 6 |
| 5 | SPDIF | SPDIF コアキシャル | 9–10 | 8 |
| 6 | AES | AES/EBU XLR | 11–12 | 10 |
| 7 | ADAT 1/2 | オプティカル | 13–14 | 12 |
| 8 | ADAT 3/4 | 〃 | 15–16 | 14 |
| 9 | ADAT 5/6 | 〃 | 17–18 | 16 |
| 10 | ADAT 7/8 | 〃 | 19–20 | 18 |

### 5.2 Fireface UCX(18 出力)**[公式]**

物理順: Analog 1–6(背面 TRS)→ Phones 7/8(前面)→ SPDIF coax 9/10 → SPDIF opt(=ADAT 1/2)11/12 → ADAT 3–8 = 13–18 ※AES 専用端子はなし(コアキシャルがケーブルアダプタで AES 互換)

| ストリップ #(全ステレオ時) | 表示名 | 物理端子 | モノ換算 ch | `/setSubmix` 値 |
|---|---|---|---|---|
| 1 | AN 1/2 | ライン出力 1/2(通常 Main Out) | 1–2 | 0 |
| 2 | AN 3/4 | ライン出力 3/4 | 3–4 | 2 |
| 3 | AN 5/6 | ライン出力 5/6 | 5–6 | 4 |
| 4 | PH 7/8 | ヘッドフォン出力 | 7–8 | 6 |
| 5 | SPDIF | SPDIF コアキシャル | 9–10 | 8 |
| 6 | ADAT 1/2 | オプティカル(SPDIF opt 兼用) | 11–12 | 10 |
| 7 | ADAT 3/4 | 〃 | 13–14 | 12 |
| 8 | ADAT 5/6 | 〃 | 15–16 | 14 |
| 9 | ADAT 7/8 | 〃 | 17–18 | 16 |

### 5.3 Babyface Pro / Babyface Pro FS(12 出力)**[公式]**

物理順: AN 1/2(XLR)→ Phones 3/4 → AS 1/2(=ADAT 1/2 or SPDIF opt)5/6 → ADAT 3–8 = 7–12 ※6.3mm と 3.5mm の両ヘッドフォンジャックは**同一チャンネル 3/4** を独立ドライバで出力

| ストリップ #(全ステレオ時) | 表示名 | 物理端子 | モノ換算 ch | `/setSubmix` 値 |
|---|---|---|---|---|
| 1 | AN 1/2 | XLR ライン出力(通常 Main Out) | 1–2 | 0 |
| 2 | PH 3/4 | ヘッドフォン出力(6.3mm/3.5mm 共通) | 3–4 | 2 |
| 3 | AS 1/2 | オプティカル(ADAT 1/2 / SPDIF) | 5–6 | 4 |
| 4 | ADAT 3/4 | 〃 | 7–8 | 6 |
| 5 | ADAT 5/6 | 〃 | 9–10 | 8 |
| 6 | ADAT 7/8 | 〃 | 11–12 | 10 |

## 6. 新プロトコル「Global OSC」(アルファ版・将来対応)

TotalMix FX **2.1 Alpha 8+** の Compatibility ドロップダウンに「Global OSC」が追加されている。バンク/バス状態に依存しない**ステートレスな絶対アドレッシング**で、フェーダーは**実 dB 値**(−300=−∞ 〜 +6)で送受信する。**[RME/実績]**

- `/output/<n>/volume`(dB), `/output/<n>/mute`, `/input|playback/<n>/…`(0始まり・ペア左ch番号)
- `/mix/in/<n>/<bus>/fader`(dB), `/controlroom/dim` など
- クラシックプロトコルの弱点(バンク相対・テーパー変換・トグルのみ)がすべて解消される設計

**方針**: v1 は安定版のクラシックプロトコルで実装し、OSC 層を抽象化しておき、Global OSC が正式リリースされ次第バックエンドとして追加する。

## 7. ユースケース別レシピ

| やりたいこと | 手順 |
|---|---|
| Main フェーダーを操作 | `/1/mastervolume` に f 値を送信(バス/バンク状態に依存しない) |
| 任意の行(パッチ段)のフェーダーを操作 | `/1/busInput`・`/1/busPlayback`・`/1/busOutput` のいずれかに f 1.0 → `/setBankStart 0` → `/1/volume{ストリップ#}` に f 値。バス切替のエコーで確定を確認してから送るのが安全 |
| 指定チャンネルを Mute | 上記の状態固定後 `/1/mute/1/{ストリップ#}` に f 1.0/0.0(3バスすべてで有効) |
| チャンネル名一覧の取得 | バス選択時の状態ダンプに含まれる `/1/trackname{n}` を読む。空き枠は文字列 `"n.a."` が返る |
| Main を疑似 Mute | `/1/mainDim` トグル(減衰量は TotalMix 側設定)、または mastervolume 0.0+元値復元 |
| Fader Dim(-20 dB) | プラグイン内部処理: 現在値を記憶 → §4 の式で dB 減算した f 値を送信 → 解除時に復元 |
| 全値リフレッシュ | `/1/busOutput 1.0` を再送(バンク全体の状態ダンプが返る) |

## 8. 実装上の落とし穴チェックリスト

1. **Float32 のみ**。Int 引数は黙殺される(既存プラグイン問題の原因)。
2. main/global 系は **トグルのみ**(1.7.0+)。ON/OFF 指定不可 → フィードバックで状態追跡してからトグル。
3. **Main アウト専用 Mute は無い**(Dim 最大化が公式回避策)。
4. バンク相対アドレスは `/setBankStart` +バンクサイズ拡大で固定する。
5. 非表示チャンネルはリモートからも消え、インデックスがずれる。
6. 受信 Float の**そのまま再送信禁止**(丸め誤差で音量がクリープする)。
7. フィードバックは `#bundle` ラップ。デコーダは bundle 対応必須。
8. `/1/mastervolume` は Control Room の Main Out フェーダー(サムバスではない)。
9. 大バンク(48)は Wi-Fi 環境で動作が重くなることがある(公式注記)。
10. マルチリモート併用時はコントローラー枠/ポートを分け、必要なら Lock Remote to submix。
11. グリッド系(`/3/muteGroups` 等)は行番号逆順。

## 出典

- **公式マニュアル**: [Fireface UCX II](https://rme-audio.de/downloads/fface_ucx2_e.pdf)(§25.8.3 OSC ページ)/ [Fireface UCX](https://rme-audio.de/downloads/fface_ucx_e.pdf) / [Babyface Pro FS](https://rme-audio.de/downloads/bface_pro_fs_e.pdf)
- **公式 OSC 対応表**: http://www.rme-audio.de/downloads/osc_table_totalmix_new.zip(実装前に要照合)
- **RME docs**: [Settings](https://docs.rme-audio.com/aoxd/816-1c_settings/) / [MIDI Remote](https://docs.rme-audio.com/aoxd/850-1c_midi_remote_tmfx/)
- **RME フォーラム(スタッフ回答)**: スレッド 31927(setBankStart)、25417(setSubmix)、24379(フィードバック/Main Mute 非存在)、32212(表リンク/トグル化)、37329(solo)、43075(Global OSC)
- **動作実績のある実装**: [totalmix-volume-control](https://github.com/fgimian/totalmix-volume-control)(dB 変換式)/ [Totalmix-Chataigne-Module](https://github.com/ziginfo/Totalmix-Chataigne-Module)(アドレス一覧)/ [streamdeck-totalmix](https://github.com/shells-dw/streamdeck-totalmix) / [AHK-TotalMix-Remote](https://github.com/echolevel/AHK-TotalMix-Remote) / [TotalKeyMix](https://github.com/carlfriedrich/TotalKeyMix)
