import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";

export const usePhotoZoom = (photoKey: string | null) => {
  const [scale, setScale] = useState(1);
  const viewRef = useRef({ scale: 1, x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    distance: number;
    midX: number;
    midY: number;
    scale: number;
    x: number;
    y: number;
  } | null>(null);
  const panRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null);

  const commit = (nextScale: number, x: number, y: number) => {
    const stage = stageRef.current;
    const clamped = Math.min(4, Math.max(0.25, nextScale));
    const maxX = stage ? Math.max(0, (stage.clientWidth * (clamped - 1)) / 2) : 0;
    const maxY = stage ? Math.max(0, (stage.clientHeight * (clamped - 1)) / 2) : 0;
    const next = {
      scale: clamped,
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
    viewRef.current = next;
    // パン中の再レンダーを避けるため transform は DOM に直接書き倍率だけ state に反映する
    if (canvasRef.current) {
      canvasRef.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
    }
    setScale(clamped);
  };

  const zoomTo = (nextScale: number, anchor?: { x: number; y: number }) => {
    const stage = stageRef.current;
    const { current } = viewRef;
    if (!stage) {
      commit(nextScale, current.x, current.y);
      return;
    }
    const rect = stage.getBoundingClientRect();
    const anchorX = anchor ? anchor.x - rect.left - rect.width / 2 : 0;
    const anchorY = anchor ? anchor.y - rect.top - rect.height / 2 : 0;
    const next = Math.min(4, Math.max(0.25, nextScale));
    commit(
      next,
      anchorX - ((anchorX - current.x) / current.scale) * next,
      anchorY - ((anchorY - current.y) / current.scale) * next,
    );
  };

  const reset = () => {
    commit(1, 0, 0);
  };

  const startPinch = () => {
    const [a, b] = pointersRef.current.values();
    const { current } = viewRef;
    pinchRef.current = {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      scale: current.scale,
      x: current.x,
      y: current.y,
    };
    panRef.current = null;
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    const [remaining] = pointersRef.current.values();
    const { current } = viewRef;
    panRef.current = remaining
      ? { pointerX: remaining.x, pointerY: remaining.y, x: current.x, y: current.y }
      : null;
  };

  const handleWheel = useEffectEvent((event: WheelEvent) => {
    if (!event.ctrlKey) {
      return;
    }
    event.preventDefault();
    const delta = (event.deltaY || event.deltaX) * (event.deltaMode === 0 ? 1 : 16);
    const step = Math.min(25, Math.max(-25, delta)) / 100;
    zoomTo(viewRef.current.scale * Math.exp(-step), {
      x: event.clientX,
      y: event.clientY,
    });
  });

  // React の onWheel は passive で登録され preventDefault が効かないため直接登録する
  useEffect(() => {
    const stage = photoKey === null ? null : stageRef.current;
    const listener = (event: WheelEvent) => {
      handleWheel(event);
    };
    stage?.addEventListener("wheel", listener, { passive: false });
    return () => {
      stage?.removeEventListener("wheel", listener);
    };
  }, [photoKey]);

  // 描画中に ref を読めないため、要素が作り直されても表示位置が残るよう描画後に書き戻す
  useLayoutEffect(() => {
    const { scale: currentScale, x, y } = viewRef.current;
    if (canvasRef.current) {
      canvasRef.current.style.transform = `translate(${x}px, ${y}px) scale(${currentScale})`;
    }
  });

  return {
    canvasRef,
    reset,
    scale,
    stageProps: {
      onPointerCancel: endPointer,
      onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointersRef.current.size >= 2) {
          startPinch();
          return;
        }
        const { current } = viewRef;
        panRef.current = {
          pointerX: event.clientX,
          pointerY: event.clientY,
          x: current.x,
          y: current.y,
        };
      },
      onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
        const pointers = pointersRef.current;
        if (!pointers.has(event.pointerId)) {
          return;
        }
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const stage = stageRef.current;
        const pinch = pinchRef.current;
        if (pinch && stage) {
          const [a, b] = pointers.values();
          if (!a || !b) {
            return;
          }
          const rect = stage.getBoundingClientRect();
          const pinchScale = Math.min(
            4,
            Math.max(0.25, (pinch.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.distance),
          );
          const originX = (pinch.midX - rect.left - rect.width / 2 - pinch.x) / pinch.scale;
          const originY = (pinch.midY - rect.top - rect.height / 2 - pinch.y) / pinch.scale;
          commit(
            pinchScale,
            (a.x + b.x) / 2 - rect.left - rect.width / 2 - originX * pinchScale,
            (a.y + b.y) / 2 - rect.top - rect.height / 2 - originY * pinchScale,
          );
          return;
        }
        const pan = panRef.current;
        if (pan) {
          commit(
            viewRef.current.scale,
            pan.x + (event.clientX - pan.pointerX),
            pan.y + (event.clientY - pan.pointerY),
          );
        }
      },
      onPointerUp: endPointer,
    },
    stageRef,
    zoomTo,
  };
};
