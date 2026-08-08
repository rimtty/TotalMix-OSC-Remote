/**
 * バックエンドのシングルトン。
 *
 * v0.2 時点ではクラシックプロトコル固定。Global OSC バックエンド(G3)
 * 実装後は、グローバル設定の protocol 選択に応じてここで生成し分ける。
 */
import { ClassicBackend } from "./classic/client";
import type { OscBackend } from "./backend";

export const backend: OscBackend = new ClassicBackend();

export * from "./backend";
