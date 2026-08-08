# TotalMix-OSC-Remote

RME TotalMix FX を OSC プロトコル経由で操作する Elgato Stream Deck プラグイン。

Stream Deck +(プラス)のダイヤル(エンコーダー)でハードウェア出力のフェーダー(例: Main アウト)を Float32 精度で操作し、キーボタンで Mute / Fader Dim(音量減衰)を切り替えることを目的とする。

既存の「OSC Remote」プラグインが Int 値しか送信できず、TotalMix FX のフェーダー系エンドポイント(Float 0.0–1.0 を期待)を正しく操作できない問題を解決するために開発する。

## ドキュメント

- [実装計画書](docs/PLAN.md)
- [TotalMix FX OSC エンドポイント対応表(UCX II / UCX / Babyface Pro)](docs/OSC-ENDPOINTS.md)
- [アイコン・液晶表示デザイン](docs/ICON-DESIGN.md)

## PoC ツール

[tools/poc/](tools/poc/) に M1 マイルストーン(OSC 疎通確認)用のスクリプトを用意している。

```bash
node tools/poc/send-mastervolume.js 0.5
```

⚠ 実行すると実際に Main アウトの音量が変わるため、音量に注意。

## ステータス

**v0.1.0 実装済み・実機検証済み**(2026-08-08、Fireface UCX II + Stream Deck +)

- Fader Dial(ダイヤル回転/微調整/タッチ Mute/ロングタッチのプリセットジャンプ、タッチストリップに dB 表示)
- Mute キー(TotalMix フィードバックと双方向同期)
- Fader Dim キー(-20 dB 減衰⇔復元、外部変更検出つき)
- **パッチ段(Row)指定**: 各アクションは Hardware Inputs / Software Playback / Hardware Outputs の任意の行をターゲットにできる(OSC バス切替+バス別フィードバックキャッシュ)
- **チャンネル名のライブ取得**: 設定画面のチャンネル一覧は TotalMix の trackname フィードバックから生成(モノ分割やリネームがあっても正しいストリップ番号・名前で表示)。未接続時はデバイス定義にフォールバック

### 開発

```bash
npm install
npm run build
npm test
```

ローカル実機テストは `npx @elgato/cli link com.rimtty.totalmix-osc-remote.sdPlugin` でリンク後、`npx @elgato/cli restart com.rimtty.totalmix-osc-remote` で反映(要開発者モード `streamdeck dev`)。TotalMix FX 側は Options → Settings → OSC で In Use / Port incoming 7001 / Port outgoing 9001 / バンクサイズ 16 を設定。
