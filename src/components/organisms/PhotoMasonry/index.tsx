import { PhotoCard, type PhotoCardData } from "#/components/molecules/PhotoCard/index.tsx";
import { masonryStyle } from "#/lib/masonry.ts";

import classes from "./PhotoMasonry.module.css";

export const PhotoMasonry = ({
  photos,
  actionsId,
  albumSlug,
  order,
  selectedPhotoIds,
  onSelect,
}: {
  photos: PhotoCardData[];
  actionsId: string;
  albumSlug?: string;
  order: "asc" | "desc";
  selectedPhotoIds: Set<string>;
  onSelect: (photoId: string, extend: boolean) => void;
}) => {
  const positions = masonryStyle(photos, [1, 2, 3, 4, 5, 6, 7, 8], {
    canvas: classes.canvas,
    gap: true,
    item: classes.item,
  });
  return (
    <div className={classes.masonry}>
      <style>{positions}</style>
      <div className={classes.canvas}>
        {photos.map((p, index) => (
          <div key={p.id} className={classes.item} data-index={index}>
            <PhotoCard
              photo={p}
              actionsId={actionsId}
              albumSlug={albumSlug}
              order={order}
              selected={selectedPhotoIds.has(p.id)}
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
