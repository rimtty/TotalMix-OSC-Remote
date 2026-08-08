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

計画フェーズ。実装は未着手。
