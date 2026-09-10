import { useEffect, useRef } from 'react';

// ============================================================================
// Android の「戻る」への対応
//
// Android では画面下の戻る操作が history.back() になる。
// 何も対策しないと、シートを開いた状態で戻るとアプリごと閉じてしまう。
//
// 対策: 何かを開いている間だけ履歴を1つ積んでおき、戻る操作が来たら
// いちばん手前のものを閉じる（アプリは閉じない）。
//
// 開いているものは複数重なりうる（ページ > フォーム > 選択シート）ので、
// ハンドラを後入れ先出しで管理する。
// ============================================================================

/** 開いているものを閉じる関数のスタック。手前にあるものほど後ろ */
const handlers: Array<() => void> = [];

/**
 * 画面の「閉じる」ボタンで閉じたときは、積んだ履歴を戻して辻褄を合わせる。
 * その history.back() で発生する popstate は無視する必要があるため数える。
 */
let ignorePops = 0;
let listening = false;

function onPopState() {
  if (ignorePops > 0) {
    ignorePops--;
    return;
  }
  const close = handlers.pop();
  if (close) close();
}

/**
 * `active` の間だけ、戻る操作で `onBack` を呼ぶ。
 * 閉じるボタンなど別の経路で閉じた場合は、積んだ履歴を自動で片付ける。
 */
export function useBackClose(active: boolean, onBack: () => void): void {
  // onBack が毎回別の関数でも購読し直さずに済むよう ref に逃がす
  const latest = useRef(onBack);
  latest.current = onBack;

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;

    const handler = () => latest.current();
    handlers.push(handler);
    window.history.pushState({ kakeiboOverlay: true }, '');

    if (!listening) {
      window.addEventListener('popstate', onPopState);
      listening = true;
    }

    return () => {
      const i = handlers.indexOf(handler);
      if (i === -1) {
        // すでに popstate 側で取り除かれている = 戻る操作で閉じた。履歴操作は不要
        return;
      }
      handlers.splice(i, 1);
      // 閉じるボタンで閉じた場合。積んだ履歴を1つ戻す
      ignorePops++;
      window.history.back();
    };
  }, [active]);
}

/**
 * 重なりのある画面（ページスタック）用。
 * 深さ1つにつきこれを1個ぶら下げると、戻る操作が1階層ずつ戻る。
 * 何も描画しない。
 */
export function BackGuard({ onBack }: { onBack: () => void }): null {
  useBackClose(true, onBack);
  return null;
}
