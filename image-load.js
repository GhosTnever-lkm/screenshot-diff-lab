export function createLatestImageLoader(decodeImage, onImageReady, onImageError) {
  const revisions = new Map();

  const nextRevision = (side) => {
    const revision = (revisions.get(side) ?? 0) + 1;
    revisions.set(side, revision);
    return revision;
  };

  return {
    invalidate(side) {
      return nextRevision(side);
    },

    isCurrent(side, revision) {
      return revisions.get(side) === revision;
    },

    async load(file, side) {
      const revision = nextRevision(side);
      let bitmap;
      try {
        bitmap = await decodeImage(file);
      } catch (error) {
        if (revisions.get(side) === revision) onImageError(file, side, error);
        return false;
      }

      if (revisions.get(side) !== revision) {
        bitmap.close?.();
        return false;
      }

      onImageReady(bitmap, file, side);
      return true;
    },
  };
}
