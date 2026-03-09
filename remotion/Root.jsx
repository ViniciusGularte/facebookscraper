import {Composition, Folder} from 'remotion';
import {ExtensionPromoVideo, TOTAL_FRAMES} from './PromoExtensionVideo';

export const RemotionRoot = () => {
  return (
    <Folder name="Marketing">
      <Composition
        id="ExtensionPromo"
        component={ExtensionPromoVideo}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={TOTAL_FRAMES}
      />
    </Folder>
  );
};
