import { useCallback, useEffect, useRef, useState } from 'react';

interface ZoomTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

interface ZoomGeometry {
  surfaceRect: DOMRect;
  surfaceWidth: number;
  surfaceHeight: number;
  renderedWidth: number;
  renderedHeight: number;
}

interface UseStackViewerZoomProps {
  enabled: boolean;
  assetKey?: string | number | null;
  getImageElement: () => HTMLImageElement | null;
  getSurfaceElement: () => HTMLDivElement | null;
  minScale?: number;
  maxScale?: number;
}

const DEFAULT_ZOOM_TRANSFORM: ZoomTransform = {
  scale: 1,
  translateX: 0,
  translateY: 0,
};

const SCALE_EPSILON = 0.001;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function useStackViewerZoom({
  enabled,
  assetKey,
  getImageElement,
  getSurfaceElement,
  minScale = 1,
  maxScale = 10,
}: UseStackViewerZoomProps) {
  const [zoomTransform, setZoomTransform] = useState<ZoomTransform>(DEFAULT_ZOOM_TRANSFORM);
  const zoomTransformRef = useRef<ZoomTransform>(DEFAULT_ZOOM_TRANSFORM);
  const pinchBaseRef = useRef<ZoomTransform | null>(null);
  const pinchStartCenterRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const previousAssetKeyRef = useRef<string | number | null | undefined>(assetKey);

  const commitTransform = useCallback((next: ZoomTransform) => {
    zoomTransformRef.current = next;
    setZoomTransform((prev) => {
      if (
        Math.abs(prev.scale - next.scale) < SCALE_EPSILON &&
        Math.abs(prev.translateX - next.translateX) < SCALE_EPSILON &&
        Math.abs(prev.translateY - next.translateY) < SCALE_EPSILON
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const getZoomGeometry = useCallback((): ZoomGeometry | null => {
    const image = getImageElement();
    const surface = getSurfaceElement();
    if (!image || !surface) return null;

    const surfaceRect = surface.getBoundingClientRect();
    if (surfaceRect.width <= 0 || surfaceRect.height <= 0) return null;

    const naturalWidth = image.naturalWidth || image.clientWidth || surfaceRect.width;
    const naturalHeight = image.naturalHeight || image.clientHeight || surfaceRect.height;
    if (naturalWidth <= 0 || naturalHeight <= 0) return null;

    const fitScale = Math.min(surfaceRect.width / naturalWidth, surfaceRect.height / naturalHeight);
    return {
      surfaceRect,
      surfaceWidth: surfaceRect.width,
      surfaceHeight: surfaceRect.height,
      renderedWidth: naturalWidth * fitScale,
      renderedHeight: naturalHeight * fitScale,
    };
  }, [getImageElement, getSurfaceElement]);

  const clampTransform = useCallback(
    (transform: ZoomTransform) => {
      const geometry = getZoomGeometry();
      if (!geometry) return DEFAULT_ZOOM_TRANSFORM;

      const scale = clamp(transform.scale, minScale, maxScale);
      if (scale <= minScale + SCALE_EPSILON) {
        return DEFAULT_ZOOM_TRANSFORM;
      }

      const maxTranslateX = Math.max(
        0,
        (geometry.renderedWidth * scale - geometry.surfaceWidth) / 2
      );
      const maxTranslateY = Math.max(
        0,
        (geometry.renderedHeight * scale - geometry.surfaceHeight) / 2
      );

      return {
        scale,
        translateX: clamp(transform.translateX, -maxTranslateX, maxTranslateX),
        translateY: clamp(transform.translateY, -maxTranslateY, maxTranslateY),
      };
    },
    [getZoomGeometry, maxScale, minScale]
  );

  const resetZoom = useCallback(() => {
    pinchBaseRef.current = null;
    pinchStartCenterRef.current = null;
    commitTransform(DEFAULT_ZOOM_TRANSFORM);
  }, [commitTransform]);

  const applyScaleAtPoint = useCallback(
    (baseTransform: ZoomTransform, nextScale: number, clientX: number, clientY: number) => {
      if (!enabled) return;

      const geometry = getZoomGeometry();
      if (!geometry) return;

      const scale = clamp(nextScale, minScale, maxScale);
      if (scale <= minScale + SCALE_EPSILON) {
        resetZoom();
        return;
      }

      const localX = clientX - geometry.surfaceRect.left;
      const localY = clientY - geometry.surfaceRect.top;
      const centerX = geometry.surfaceWidth / 2;
      const centerY = geometry.surfaceHeight / 2;

      const translateX =
        localX -
        centerX -
        ((localX - centerX - baseTransform.translateX) / baseTransform.scale) * scale;
      const translateY =
        localY -
        centerY -
        ((localY - centerY - baseTransform.translateY) / baseTransform.scale) * scale;

      commitTransform(
        clampTransform({
          scale,
          translateX,
          translateY,
        })
      );
    },
    [clampTransform, commitTransform, enabled, getZoomGeometry, maxScale, minScale, resetZoom]
  );

  const zoomWithWheel = useCallback(
    (clientX: number, clientY: number, deltaY: number) => {
      if (!enabled || deltaY === 0) return;

      const baseTransform = zoomTransformRef.current;
      const zoomFactor = Math.exp(-deltaY * 0.0025);
      applyScaleAtPoint(baseTransform, baseTransform.scale * zoomFactor, clientX, clientY);
    },
    [applyScaleAtPoint, enabled]
  );

  const startPinch = useCallback((clientX?: number, clientY?: number) => {
    pinchBaseRef.current = pinchBaseRef.current ?? zoomTransformRef.current;
    if (
      typeof clientX === 'number' &&
      typeof clientY === 'number' &&
      Number.isFinite(clientX) &&
      Number.isFinite(clientY)
    ) {
      pinchStartCenterRef.current = { clientX, clientY };
    }
  }, []);

  const updatePinch = useCallback(
    (clientX: number, clientY: number, scaleMultiplier: number) => {
      if (!enabled || scaleMultiplier <= 0) return;

      const baseTransform = pinchBaseRef.current ?? zoomTransformRef.current;
      const startCenter = pinchStartCenterRef.current;
      if (!startCenter) {
        pinchStartCenterRef.current = { clientX, clientY };
        return;
      }

      const geometry = getZoomGeometry();
      if (!geometry) return;

      const scale = clamp(baseTransform.scale * scaleMultiplier, minScale, maxScale);
      if (scale <= minScale + SCALE_EPSILON) {
        resetZoom();
        return;
      }

      const startLocalX = startCenter.clientX - geometry.surfaceRect.left;
      const startLocalY = startCenter.clientY - geometry.surfaceRect.top;
      const currentLocalX = clientX - geometry.surfaceRect.left;
      const currentLocalY = clientY - geometry.surfaceRect.top;
      const centerX = geometry.surfaceWidth / 2;
      const centerY = geometry.surfaceHeight / 2;

      const translateX =
        currentLocalX -
        centerX -
        ((startLocalX - centerX - baseTransform.translateX) / baseTransform.scale) * scale;
      const translateY =
        currentLocalY -
        centerY -
        ((startLocalY - centerY - baseTransform.translateY) / baseTransform.scale) * scale;

      commitTransform(
        clampTransform({
          scale,
          translateX,
          translateY,
        })
      );
    },
    [clampTransform, commitTransform, enabled, getZoomGeometry, maxScale, minScale, resetZoom]
  );

  const endPinch = useCallback(() => {
    pinchBaseRef.current = null;
    pinchStartCenterRef.current = null;
    commitTransform(clampTransform(zoomTransformRef.current));
  }, [clampTransform, commitTransform]);

  const panBy = useCallback(
    (deltaX: number, deltaY: number) => {
      if (!enabled) return;

      const currentTransform = zoomTransformRef.current;
      if (currentTransform.scale <= minScale + SCALE_EPSILON) return;

      commitTransform(
        clampTransform({
          ...currentTransform,
          translateX: currentTransform.translateX + deltaX,
          translateY: currentTransform.translateY + deltaY,
        })
      );
    },
    [clampTransform, commitTransform, enabled, minScale]
  );

  useEffect(() => {
    if (previousAssetKeyRef.current === assetKey) return;
    previousAssetKeyRef.current = assetKey;
    resetZoom();
  }, [assetKey, resetZoom]);

  useEffect(() => {
    if (!enabled) {
      resetZoom();
    }
  }, [enabled, resetZoom]);

  useEffect(() => {
    if (!enabled) return undefined;

    const handleResize = () => {
      commitTransform(clampTransform(zoomTransformRef.current));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampTransform, commitTransform, enabled]);

  return {
    zoomTransform,
    isZoomed: zoomTransform.scale > minScale + SCALE_EPSILON,
    resetZoom,
    zoomWithWheel,
    startPinch,
    updatePinch,
    endPinch,
    panBy,
  };
}
