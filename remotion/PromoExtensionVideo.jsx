import {Audio} from '@remotion/media';
import {loadFont as loadBarlow} from '@remotion/google-fonts/Barlow';
import {loadFont as loadBarlowCondensed} from '@remotion/google-fonts/BarlowCondensed';
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const {fontFamily: FONT_BODY} = loadBarlow('normal', {
  weights: ['400', '500', '600', '700'],
  subsets: ['latin'],
});

const {fontFamily: FONT_DISPLAY} = loadBarlowCondensed('normal', {
  weights: ['700', '800', '900'],
  subsets: ['latin'],
});

const FPS = 30;
const toFrames = (seconds) => Math.round(seconds * FPS);
const SPRING_CONFIG = {damping: 18, stiffness: 120, mass: 0.8};

const SCENE_FRAMES = {
  intro: toFrames(3),
  problem: toFrames(7),
  solution: toFrames(8),
  how: toFrames(14),
  stats: toFrames(8),
  pricing: toFrames(8),
  outro: toFrames(7),
};

export const TOTAL_FRAMES = 55 * FPS;

const theme = {
  orange: '#F5630A',
  orangeDark: '#C94E00',
  orangePale: '#FFF3EC',
  charcoal: '#1C1C1C',
  offwhite: '#F5F4F2',
  white: '#FFFFFF',
  border: '#E2DDD8',
  textSoft: '#3D3D3D',
  muted: '#717171',
  green: '#16A34A',
  greenSoft: '#F0FDF4',
  red: '#DC2626',
  redSoft: '#FEF2F2',
  yellow: '#D97706',
  yellowSoft: '#FFFBEB',
};

const clampConfig = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
};

const layer = (background) => ({
  background,
  fontFamily: FONT_BODY,
});

const entrance = (frame, fps, delay = 0, duration = 0.55, distance = 40) => {
  const start = delay * fps;
  const end = start + duration * fps;
  const opacity = interpolate(frame, [start, end], [0, 1], clampConfig);
  const y = interpolate(frame, [start, end], [distance, 0], clampConfig);
  return {
    opacity,
    transform: `translateY(${y}px)`,
  };
};

const scaleIn = (frame, fps, delay = 0, from = 0.88) => {
  const progress = spring({
    frame: Math.max(0, frame - delay * fps),
    fps,
    config: SPRING_CONFIG,
  });

  const opacity = interpolate(progress, [0, 0.2, 1], [0, 0.7, 1], clampConfig);
  const scale = interpolate(progress, [0, 1], [from, 1], clampConfig);
  return {
    opacity,
    transform: `scale(${scale})`,
  };
};

const typeSlice = (text, frame, fps, start, seconds) => {
  const characters = Math.floor(
    interpolate(
      frame,
      [start * fps, (start + seconds) * fps],
      [0, text.length],
      clampConfig,
    ),
  );

  return text.slice(0, characters);
};

const cardStyle = {
  borderRadius: 30,
  border: `1px solid ${theme.border}`,
  background: theme.white,
  boxShadow: '0 24px 56px rgba(28, 28, 28, 0.12)',
};

const BrandMark = ({size = 56, withSquare = true}) => {
  const mark = (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none">
      {withSquare ? <rect x="6" y="6" width="116" height="116" rx="28" fill={theme.orange} /> : null}
      <circle
        cx="64"
        cy="64"
        r="37"
        stroke="#FFFFFF"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray="166 66"
        transform="rotate(-34 64 64)"
      />
      <circle
        cx="64"
        cy="64"
        r="24"
        stroke="#FFFFFF"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray="102 49"
        transform="rotate(-30 64 64)"
      />
      <path d="M64 64L90 38" stroke="#FFFFFF" strokeWidth="8" strokeLinecap="round" />
      <circle cx="64" cy="64" r="8" fill="#FFFFFF" />
      <circle cx="96" cy="32" r="11" fill="#FFFFFF" />
    </svg>
  );

  return mark;
};

const Eyebrow = ({children, color = theme.orange}) => (
  <div
    style={{
      color,
      fontFamily: FONT_DISPLAY,
      fontSize: 22,
      fontWeight: 700,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
    }}
  >
    {children}
  </div>
);

const Title = ({children, color = theme.charcoal, size = 84, maxWidth = 980}) => (
  <div
    style={{
      marginTop: 18,
      maxWidth,
      fontFamily: FONT_DISPLAY,
      fontSize: size,
      fontWeight: 900,
      lineHeight: 0.92,
      letterSpacing: '-0.04em',
      color,
      whiteSpace: 'pre-line',
    }}
  >
    {children}
  </div>
);

const Copy = ({children, color = theme.textSoft, size = 28, maxWidth = 760}) => (
  <div
    style={{
      marginTop: 20,
      maxWidth,
      fontSize: size,
      lineHeight: 1.28,
      color,
      whiteSpace: 'pre-line',
    }}
  >
    {children}
  </div>
);

const KeywordPill = ({label, frame, delay}) => {
  const {fps} = useVideoConfig();
  const style = scaleIn(frame, fps, delay, 0.7);

  return (
    <div
      style={{
        ...style,
        padding: '12px 16px',
        borderRadius: 999,
        border: `1px solid #FFD4B8`,
        background: theme.orangePale,
        color: theme.orangeDark,
        fontSize: 22,
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  );
};

const GlowOrb = ({size = 112}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pulse = interpolate(
    Math.sin((frame / fps) * Math.PI * 1.5),
    [-1, 1],
    [0.92, 1.08],
    clampConfig,
  );
  const shadow = interpolate(
    Math.sin((frame / fps) * Math.PI * 1.5),
    [-1, 1],
    [12, 26],
    clampConfig,
  );

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `4px solid ${theme.green}`,
        transform: `scale(${pulse})`,
        boxShadow: `0 0 ${shadow}px rgba(22, 163, 74, 0.42)`,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        style={{
          width: size - 28,
          height: size - 28,
          borderRadius: '50%',
          background: theme.green,
        }}
      />
    </div>
  );
};

const FacebookPostCard = () => (
  <div
    style={{
      ...cardStyle,
      width: 900,
      padding: 34,
    }}
  >
    <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
      <div
        style={{
          width: 62,
          height: 62,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #D6D6D6 0%, #BDBDBD 100%)',
        }}
      />
      <div>
        <div style={{fontSize: 26, fontWeight: 700, color: theme.charcoal}}>Sarah M. · 3 min ago</div>
        <div style={{fontSize: 18, color: theme.muted}}>North Tampa Homeowners</div>
      </div>
    </div>
    <div
      style={{
        marginTop: 28,
        fontFamily: FONT_DISPLAY,
        fontSize: 60,
        lineHeight: 0.94,
        letterSpacing: '-0.03em',
        fontWeight: 900,
        color: theme.charcoal,
      }}
    >
      Anyone recommend a plumber? Urgent.
    </div>
    <div
      style={{
        marginTop: 20,
        fontSize: 28,
        lineHeight: 1.28,
        color: theme.textSoft,
      }}
    >
      No hot water, need someone ASAP. Budget flexible.
    </div>
    <div
      style={{
        marginTop: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        fontSize: 22,
        fontWeight: 600,
        color: theme.muted,
      }}
    >
      <span>👍 4</span>
      <span>💬 12 comments</span>
    </div>
  </div>
);

const ExtensionMockup = ({statusText}) => (
  <div
    style={{
      ...cardStyle,
      width: 1260,
      height: 640,
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        height: 66,
        borderBottom: `1px solid ${theme.border}`,
        background: '#FFF8F3',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 22px',
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
        <BrandMark size={34} />
        <div>
          <div style={{fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 900}}>GrabClientsNow</div>
          <div style={{fontSize: 12, fontWeight: 600, color: theme.orangeDark}}>Chrome Extension</div>
        </div>
      </div>
      <div
        style={{
          height: 36,
          padding: '0 14px',
          borderRadius: 999,
          border: `1px solid #BBF7D0`,
          background: theme.greenSoft,
          color: theme.green,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: theme.green,
            boxShadow: '0 0 0 4px rgba(22, 163, 74, 0.16)',
          }}
        />
        Logged in
      </div>
    </div>

    <div style={{display: 'grid', gridTemplateColumns: '212px 1fr', height: 'calc(100% - 66px)'}}>
      <div
        style={{
          background: theme.charcoal,
          color: theme.white,
          padding: 22,
          display: 'grid',
          alignContent: 'start',
          gap: 14,
        }}
      >
        {['🏠 Home', '👥 Groups', '🎯 Alerts', '🔔 Notifications', '⚙️ Settings'].map((item, index) => (
          <div
            key={item}
            style={{
              height: 42,
              borderRadius: 10,
              padding: '0 12px',
              display: 'flex',
              alignItems: 'center',
              fontSize: 16,
              fontWeight: 700,
              background: index === 0 ? theme.orange : 'transparent',
              color: theme.white,
            }}
          >
            {item}
          </div>
        ))}
      </div>

      <div style={{background: theme.offwhite, padding: 30}}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 1fr',
            gap: 24,
            alignItems: 'center',
            padding: 28,
            borderRadius: 24,
            border: `1px solid ${theme.border}`,
            background: theme.white,
            boxShadow: '0 8px 24px rgba(28, 28, 28, 0.06)',
          }}
        >
          <div style={{display: 'grid', placeItems: 'center'}}>
            <GlowOrb />
          </div>
          <div>
            <Eyebrow>Live Monitoring</Eyebrow>
            <div
              style={{
                marginTop: 10,
                fontFamily: FONT_DISPLAY,
                fontSize: 64,
                lineHeight: 0.92,
                fontWeight: 900,
                letterSpacing: '-0.04em',
                color: theme.charcoal,
              }}
            >
              Monitoring is ON
            </div>
            <div style={{marginTop: 14, fontSize: 22, color: theme.textSoft}}>{statusText}</div>
          </div>
        </div>

        <div
          style={{
            marginTop: 24,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 18,
          }}
        >
          {[
            ['777 groups', 'Watching selected local groups'],
            ['Next scan 4 min', 'Balanced frequency enabled'],
            ['0 leads this week', 'Ready for the next hot post'],
          ].map(([headline, copy]) => (
            <div
              key={headline}
              style={{
                borderRadius: 18,
                border: `1px solid ${theme.border}`,
                background: theme.white,
                padding: 22,
              }}
            >
              <div
                style={{
                  color: theme.orangeDark,
                  fontFamily: FONT_DISPLAY,
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                System Status
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontFamily: FONT_DISPLAY,
                  fontSize: 40,
                  lineHeight: 0.94,
                  fontWeight: 800,
                  color: theme.charcoal,
                }}
              >
                {headline}
              </div>
              <div style={{marginTop: 10, fontSize: 18, color: theme.textSoft}}>{copy}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const PhoneNotification = () => (
  <div
    style={{
      width: 340,
      borderRadius: 32,
      padding: '16px 14px 20px',
      background: theme.charcoal,
      boxShadow: '0 24px 52px rgba(28, 28, 28, 0.22)',
    }}
  >
    <div
      style={{
        width: 118,
        height: 18,
        margin: '0 auto 16px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.12)',
      }}
    />
    <div
      style={{
        borderRadius: 20,
        background: theme.white,
        padding: 18,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: theme.orangeDark,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        GrabClientsNow ⚡
      </div>
      <div
        style={{
          marginTop: 12,
          fontSize: 28,
          lineHeight: 1.04,
          fontWeight: 700,
          color: theme.charcoal,
        }}
      >
        New lead · Plumber needed · Tampa FL
      </div>
      <div style={{marginTop: 10, fontSize: 16, color: theme.muted}}>Open the post and reply before others pile in.</div>
    </div>
  </div>
);

const PricingCard = ({
  title,
  price,
  copy,
  foot,
  highlighted = false,
}) => (
  <div
    style={{
      borderRadius: 28,
      padding: '32px 30px',
      background: highlighted ? theme.orange : theme.white,
      color: highlighted ? theme.white : theme.charcoal,
      border: highlighted ? 'none' : `1px solid ${theme.charcoal}`,
      boxShadow: highlighted
        ? '0 24px 56px rgba(245, 99, 10, 0.24)'
        : '0 16px 36px rgba(28, 28, 28, 0.08)',
      transform: highlighted ? 'scale(1.04)' : 'scale(1)',
    }}
  >
    <div
      style={{
        fontFamily: FONT_DISPLAY,
        fontSize: 26,
        lineHeight: 1,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        opacity: highlighted ? 0.86 : 1,
      }}
    >
      {title}
    </div>
    <div
      style={{
        marginTop: 18,
        fontFamily: FONT_DISPLAY,
        fontSize: 80,
        lineHeight: 0.88,
        fontWeight: 900,
        letterSpacing: '-0.04em',
      }}
    >
      {price}
    </div>
    <div style={{marginTop: 18, fontSize: 26, lineHeight: 1.24, opacity: highlighted ? 0.96 : 0.82}}>{copy}</div>
    <div style={{marginTop: 24, fontSize: 22, fontWeight: 700, opacity: highlighted ? 1 : 0.72}}>{foot}</div>
  </div>
);

const LogoStingScene = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const lineScale = spring({
    frame,
    fps,
    config: {damping: 18, stiffness: 150, mass: 0.8},
  });
  const logoStyle = entrance(frame, fps, 0.4, 0.5, 54);
  const tagStyle = entrance(frame, fps, 0.9, 0.45, 30);

  return (
    <AbsoluteFill
      style={layer(
        'radial-gradient(circle at 20% 18%, rgba(245,99,10,0.24), transparent 24%), radial-gradient(circle at 82% 20%, rgba(245,99,10,0.12), transparent 18%), linear-gradient(180deg, #1C1C1C 0%, #111111 100%)',
      )}
    >
      <div
        style={{
          position: 'absolute',
          left: 260,
          right: 260,
          top: 360,
          height: 6,
          borderRadius: 999,
          background: theme.orange,
          transform: `scaleX(${lineScale})`,
          transformOrigin: 'left center',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <div style={{textAlign: 'center'}}>
          <div
            style={{
              ...logoStyle,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 18,
            }}
          >
            <BrandMark size={80} />
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 86,
                fontWeight: 900,
                lineHeight: 0.92,
                letterSpacing: '-0.04em',
                color: theme.white,
              }}
            >
              GrabClientsNow
            </div>
          </div>

          <div
            style={{
              ...tagStyle,
              marginTop: 22,
              fontSize: 28,
              fontWeight: 500,
              color: '#9CA3AF',
            }}
          >
            Catch clients before your competitors do.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ProblemScene = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cardStyleIn = scaleIn(frame, fps, 1.4, 0.8);
  const avatarsVisible = Math.max(0, Math.min(12, Math.floor((frame - 3 * fps) / 2)));

  return (
    <AbsoluteFill style={layer(theme.offwhite)}>
      <div style={{position: 'absolute', left: 120, top: 110, ...entrance(frame, fps, 0.1, 0.45, 36)}}>
        <Copy color={theme.muted} size={28}>
          Right now, someone in your city just posted:
        </Copy>
        <Title size={92} maxWidth={1260}>
          Anyone recommend a plumber? Urgent.
        </Title>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 300,
          ...cardStyleIn,
        }}
      >
        <FacebookPostCard />
      </div>

      <div
        style={{
          position: 'absolute',
          right: 130,
          bottom: 150,
          width: 470,
          padding: 28,
          borderRadius: 26,
          background: theme.white,
          border: `1px solid ${theme.border}`,
          boxShadow: '0 18px 40px rgba(28, 28, 28, 0.08)',
          opacity: frame >= 3 * fps ? 1 : 0,
        }}
      >
        <div style={{fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 700, color: theme.orange}}>
          COMPETITOR RUSH
        </div>
        <div style={{marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 12}}>
          {new Array(12).fill(true).map((_, index) => (
            <div
              key={index}
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: index < avatarsVisible ? '#CFCFCF' : '#ECECEC',
                opacity: index < avatarsVisible ? 1 : 0.22,
                border: index === 11 ? `3px solid ${theme.red}` : 'none',
              }}
            />
          ))}
        </div>
        <div style={{marginTop: 18, fontSize: 28, fontWeight: 700, color: theme.charcoal}}>
          12 replies in 8 minutes
        </div>
        <div style={{marginTop: 10, fontSize: 24, fontWeight: 700, color: theme.red}}>
          You weren&apos;t one of them.
        </div>
      </div>
    </AbsoluteFill>
  );
};

const SolutionScene = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const statusText = typeSlice('Checking 777 groups... Next scan: 4 min', frame, fps, 1.5, 2.2);

  return (
    <AbsoluteFill
      style={layer(
        'radial-gradient(circle at 16% 18%, rgba(255,255,255,0.14), transparent 20%), linear-gradient(180deg, #F5630A 0%, #E95A05 100%)',
      )}
    >
      <div style={{position: 'absolute', top: 84, width: '100%', textAlign: 'center', ...entrance(frame, fps, 0.15, 0.4, 26)}}>
        <Eyebrow color={theme.white}>Introducing</Eyebrow>
      </div>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 180,
          transform: `translateX(-50%) ${scaleIn(frame, fps, 0.35, 0.84).transform}`,
          opacity: scaleIn(frame, fps, 0.35, 0.84).opacity,
        }}
      >
        <ExtensionMockup statusText={statusText} />
      </div>

      <div style={{position: 'absolute', bottom: 80, width: '100%', textAlign: 'center', ...entrance(frame, fps, 0.8, 0.45, 28)}}>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 72,
            lineHeight: 0.92,
            fontWeight: 900,
            letterSpacing: '-0.04em',
            color: theme.white,
          }}
        >
          GrabClientsNow
        </div>
      </div>
    </AbsoluteFill>
  );
};

const HowItWorksScene = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const replyText = typeSlice(
    "Hi! I'm Mike, licensed plumber in Tampa. Available today.",
    frame,
    fps,
    9.6,
    2.6,
  );

  return (
    <AbsoluteFill style={layer(theme.offwhite)}>
      <div style={{position: 'absolute', top: 78, left: 100, ...entrance(frame, fps, 0.1, 0.45, 28)}}>
        <Eyebrow>How it works</Eyebrow>
        <Title size={82}>3 steps. Done.</Title>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 100,
          top: 240,
          width: 540,
          height: 330,
          padding: 28,
          ...cardStyle,
          ...entrance(frame, fps, 0.8, 0.55, 42),
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 18,
            right: 24,
            fontFamily: FONT_DISPLAY,
            fontSize: 102,
            fontWeight: 900,
            color: 'rgba(245,99,10,0.08)',
            lineHeight: 1,
          }}
        >
          01
        </div>
        <div style={{fontSize: 38}}>🔑</div>
        <div style={{marginTop: 16, fontFamily: FONT_DISPLAY, fontSize: 50, fontWeight: 700, lineHeight: 0.94}}>
          Set Keywords
        </div>
        <div style={{marginTop: 22, display: 'flex', flexWrap: 'wrap', gap: 12}}>
          {['urgent', 'recommend', 'need', 'quote'].map((label, index) => (
            <KeywordPill key={label} label={label} frame={frame} delay={1.2 + index * 0.12} />
          ))}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 100,
          top: 240,
          width: 540,
          height: 330,
          padding: 28,
          ...cardStyle,
          ...entrance(frame, fps, 4.0, 0.55, 42),
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 18,
            right: 24,
            fontFamily: FONT_DISPLAY,
            fontSize: 102,
            fontWeight: 900,
            color: 'rgba(245,99,10,0.08)',
            lineHeight: 1,
          }}
        >
          02
        </div>
        <div style={{fontSize: 38}}>👥</div>
        <div style={{marginTop: 16, fontFamily: FONT_DISPLAY, fontSize: 50, fontWeight: 700, lineHeight: 0.94}}>
          Choose Your Groups
        </div>
        <div style={{marginTop: 24, display: 'grid', gap: 14}}>
          {[
            'Cincinnati Contractors',
            'Austin Business Networking',
            'Tampa Homeowner Referrals',
          ].map((group, index) => {
            const checkProgress = spring({
              frame: Math.max(0, frame - (4.7 + index * 0.18) * fps),
              fps,
              config: SPRING_CONFIG,
            });

            return (
              <div
                key={group}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '14px 16px',
                  borderRadius: 16,
                  border: `1.5px solid ${theme.orange}`,
                  background: '#FFF8F5',
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: theme.orange,
                    transform: `scale(${interpolate(checkProgress, [0, 1], [0.4, 1], clampConfig)})`,
                  }}
                />
                <div>
                  <div style={{fontSize: 20, fontWeight: 700, color: theme.charcoal}}>{group}</div>
                  <div style={{fontSize: 16, color: theme.muted}}>Selected for monitoring</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 100,
          right: 100,
          bottom: 80,
          height: 360,
          padding: 30,
          ...cardStyle,
          ...entrance(frame, fps, 8.0, 0.6, 48),
          display: 'grid',
          gridTemplateColumns: '360px 1fr 290px',
          gap: 24,
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{fontFamily: FONT_DISPLAY, fontSize: 126, fontWeight: 900, color: 'rgba(245,99,10,0.10)', lineHeight: 1}}>
            03
          </div>
          <div style={{marginTop: -22, fontFamily: FONT_DISPLAY, fontSize: 62, fontWeight: 900, lineHeight: 0.9}}>
            Alert Fires.
            <br />
            You Reply First.
          </div>
        </div>

        <div>
          <PhoneNotification />
          <div
            style={{
              marginTop: 18,
              padding: '18px 20px',
              borderRadius: 18,
              background: '#FFF8F5',
              border: `1px solid #FFD4B8`,
              minHeight: 96,
            }}
          >
            <div style={{fontSize: 20, fontWeight: 700, color: theme.orangeDark}}>Reply draft</div>
            <div style={{marginTop: 10, fontSize: 22, lineHeight: 1.32, color: theme.charcoal}}>
              {replyText}
              <span style={{opacity: frame % 20 < 10 ? 1 : 0}}>|</span>
            </div>
          </div>
        </div>

        <div
          style={{
            alignSelf: 'stretch',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              padding: '18px 20px',
              borderRadius: 22,
              background: theme.greenSoft,
              border: `1px solid #BBF7D0`,
              color: theme.green,
              fontSize: 28,
              fontWeight: 700,
              lineHeight: 1.2,
            }}
          >
            ✓ Job closed.
            <br />
            $0 lead cost.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const StatBlock = ({value, suffix = '', label, delay = 0}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = interpolate(frame, [delay * fps, (delay + 2) * fps], [0, value], clampConfig);
  const shownValue = Math.round(progress);

  return (
    <div style={{flex: 1, textAlign: 'center'}}>
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 108,
          fontWeight: 900,
          lineHeight: 0.9,
          letterSpacing: '-0.04em',
          color: theme.orange,
        }}
      >
        {shownValue}
        {suffix}
      </div>
      <div style={{marginTop: 18, fontSize: 26, fontWeight: 600, color: '#9CA3AF'}}>{label}</div>
    </div>
  );
};

const StatsBarScene = () => (
  <AbsoluteFill
    style={layer(
      'radial-gradient(circle at 18% 20%, rgba(245,99,10,0.18), transparent 22%), linear-gradient(180deg, #1C1C1C 0%, #111111 100%)',
    )}
  >
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        style={{
          width: 1500,
          height: 360,
          borderRadius: 34,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 60px',
        }}
      >
        <StatBlock value={60} suffix=" SEC" label="DFY Alert Speed" delay={0} />
        <div style={{width: 1, height: 150, background: '#333'}} />
        <StatBlock value={70} suffix="%+" label="First-Reply Close Rate" delay={0.4} />
        <div style={{width: 1, height: 150, background: '#333'}} />
        <div style={{flex: 1, textAlign: 'center'}}>
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 108,
              fontWeight: 900,
              lineHeight: 0.9,
              letterSpacing: '-0.04em',
              color: theme.orange,
            }}
          >
            $0
          </div>
          <div style={{marginTop: 18, fontSize: 26, fontWeight: 600, color: '#9CA3AF'}}>Cost Per Lead</div>
        </div>
      </div>
    </div>
  </AbsoluteFill>
);

const PricingCTAScene = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  return (
    <AbsoluteFill
      style={layer(
        'radial-gradient(circle at 18% 16%, rgba(245,99,10,0.08), transparent 22%), radial-gradient(circle at 84% 18%, rgba(245,99,10,0.08), transparent 18%), linear-gradient(180deg, #FFFFFF 0%, #FAF7F3 100%)',
      )}
    >
      <div style={{position: 'absolute', top: 108, width: '100%', textAlign: 'center', ...entrance(frame, fps, 0.1, 0.45, 26)}}>
        <Eyebrow>Pricing</Eyebrow>
        <Title size={80}>Pick your speed to lead.</Title>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 180,
          right: 180,
          top: 320,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 28,
        }}
      >
        <div style={entrance(frame, fps, 0.5, 0.55, 42)}>
          <PricingCard
            title="Self-Service"
            price="$49 LIFETIME"
            copy="Chrome Extension · You reply"
            foot="★ 7-day refund"
          />
        </div>
        <div style={entrance(frame, fps, 0.8, 0.55, 42)}>
          <PricingCard
            title="Done-For-You"
            price="$199/mo"
            copy="We comment in 60 seconds"
            foot="Limited spots per city"
            highlighted
          />
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 120,
          width: '100%',
          textAlign: 'center',
          ...entrance(frame, fps, 1.1, 0.4, 24),
        }}
      >
        <div style={{fontSize: 28, fontWeight: 600, color: theme.charcoal}}>Free trial — no card needed</div>
        <div
          style={{
            width: interpolate(frame, [1.4 * fps, 2.4 * fps], [0, 340], clampConfig),
            height: 4,
            margin: '18px auto 0',
            borderRadius: 999,
            background: theme.orange,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

const OutroScene = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const charcoalOpacity = interpolate(frame, [0, fps], [0, 1], clampConfig);

  return (
    <AbsoluteFill style={layer(theme.orange)}>
      <AbsoluteFill style={{background: theme.charcoal, opacity: charcoalOpacity}} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          color: theme.white,
        }}
      >
        <div style={{textAlign: 'center'}}>
          <div style={{display: 'inline-flex', alignItems: 'center', gap: 20, ...entrance(frame, fps, 0.2, 0.5, 40)}}>
            <BrandMark size={86} />
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: 94,
                fontWeight: 900,
                lineHeight: 0.92,
                letterSpacing: '-0.04em',
              }}
            >
              GrabClientsNow
            </div>
          </div>
          <div style={{marginTop: 24, fontSize: 34, fontWeight: 600, color: 'rgba(255,255,255,0.86)', ...entrance(frame, fps, 0.6, 0.45, 24)}}>
            Be First. Win Every Job.
          </div>
          <div style={{marginTop: 40, display: 'flex', justifyContent: 'center', ...entrance(frame, fps, 0.8, 0.45, 18)}}>
            <GlowOrb size={118} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const ExtensionPromoVideo = () => {
  return (
    <AbsoluteFill style={{backgroundColor: theme.offwhite}}>
      <Audio
        src={staticFile('theme.mp3')}
        volume={(f) =>
          f >= TOTAL_FRAMES - 3 * FPS
            ? interpolate(f, [TOTAL_FRAMES - 3 * FPS, TOTAL_FRAMES], [0.7, 0], clampConfig)
            : 0.7
        }
      />

      <Sequence from={0} durationInFrames={SCENE_FRAMES.intro} premountFor={FPS}>
        <LogoStingScene />
      </Sequence>
      <Sequence
        from={SCENE_FRAMES.intro}
        durationInFrames={SCENE_FRAMES.problem}
        premountFor={FPS}
      >
        <ProblemScene />
      </Sequence>
      <Sequence
        from={SCENE_FRAMES.intro + SCENE_FRAMES.problem}
        durationInFrames={SCENE_FRAMES.solution}
        premountFor={FPS}
      >
        <SolutionScene />
      </Sequence>
      <Sequence
        from={SCENE_FRAMES.intro + SCENE_FRAMES.problem + SCENE_FRAMES.solution}
        durationInFrames={SCENE_FRAMES.how}
        premountFor={FPS}
      >
        <HowItWorksScene />
      </Sequence>
      <Sequence
        from={SCENE_FRAMES.intro + SCENE_FRAMES.problem + SCENE_FRAMES.solution + SCENE_FRAMES.how}
        durationInFrames={SCENE_FRAMES.stats}
        premountFor={FPS}
      >
        <StatsBarScene />
      </Sequence>
      <Sequence
        from={
          SCENE_FRAMES.intro +
          SCENE_FRAMES.problem +
          SCENE_FRAMES.solution +
          SCENE_FRAMES.how +
          SCENE_FRAMES.stats
        }
        durationInFrames={SCENE_FRAMES.pricing}
        premountFor={FPS}
      >
        <PricingCTAScene />
      </Sequence>
      <Sequence
        from={
          SCENE_FRAMES.intro +
          SCENE_FRAMES.problem +
          SCENE_FRAMES.solution +
          SCENE_FRAMES.how +
          SCENE_FRAMES.stats +
          SCENE_FRAMES.pricing
        }
        durationInFrames={SCENE_FRAMES.outro}
        premountFor={FPS}
      >
        <OutroScene />
      </Sequence>
    </AbsoluteFill>
  );
};
