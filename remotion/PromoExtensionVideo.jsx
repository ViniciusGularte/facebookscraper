import {Audio} from '@remotion/media';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {wipe} from '@remotion/transitions/wipe';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import upbeatTrack from '../store-assets/audio/Upbeat Tropical House by Infraction [No Copyright Music] _ Positive - Infraction - No Copyright Music (youtube).mp3';

const FPS = 30;
const TRANSITION_FRAMES = 10;

const DURATIONS = {
  intro: 100,
  groups: 180,
  keywords: 150,
  mobile: 210,
  leads: 160,
  cta: 150,
};

export const TOTAL_FRAMES =
  DURATIONS.intro +
  DURATIONS.groups +
  DURATIONS.keywords +
  DURATIONS.mobile +
  DURATIONS.leads +
  DURATIONS.cta -
  TRANSITION_FRAMES * 5;

const theme = {
  surface: '#0c1a10',
  surface2: '#112016',
  surface3: '#0d2018',
  border: '#1e3a28',
  borderHover: '#2a5a38',
  green: '#00ff88',
  cyan: '#00e5cc',
  text: '#e8f5ee',
  muted: '#a7cfba',
  warn: '#ffaa00',
  warnDim: '#ffaa0018',
};

const MotionStyles = () => (
  <style>{`
    @keyframes floatSoft {
      0% { transform: translateY(0px); }
      50% { transform: translateY(-8px); }
      100% { transform: translateY(0px); }
    }

    @keyframes blinkCursor {
      0% { opacity: 1; }
      49% { opacity: 1; }
      50% { opacity: 0; }
      100% { opacity: 0; }
    }

    @keyframes shimmer {
      0% { background-position: -220px 0; }
      100% { background-position: 220px 0; }
    }

    .float-soft { animation: floatSoft 4.8s ease-in-out infinite; }
    .blink-cursor { animation: blinkCursor 0.9s steps(1, end) infinite; }
    .shimmer-line {
      background-image: linear-gradient(90deg, rgba(0,255,136,0), rgba(0,255,136,0.35), rgba(0,255,136,0));
      background-size: 220px 100%;
      animation: shimmer 2.4s linear infinite;
    }
  `}</style>
);

const paletteByScene = {
  intro: {
    bg: 'radial-gradient(circle at 18% 20%, #153326 0%, #0a1710 42%, #040b07 100%)',
    glow: '#00ff8822',
  },
  groups: {
    bg: 'radial-gradient(circle at 82% 18%, #1a3124 0%, #0a1711 44%, #050c08 100%)',
    glow: '#00e5cc22',
  },
  keywords: {
    bg: 'radial-gradient(circle at 16% 82%, #1f3427 0%, #0a1710 44%, #04100a 100%)',
    glow: '#ffaa0020',
  },
  mobile: {
    bg: 'radial-gradient(circle at 82% 22%, #19362a 0%, #0b1a13 44%, #040907 100%)',
    glow: '#00ff8820',
  },
  leads: {
    bg: 'radial-gradient(circle at 22% 22%, #173427 0%, #0a1711 45%, #030906 100%)',
    glow: '#00e5cc20',
  },
  cta: {
    bg: 'radial-gradient(circle at 50% 0%, #1a3629 0%, #0a1711 45%, #030805 100%)',
    glow: '#00ff8820',
  },
};

const SceneShell = ({children, scene}) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 260], [-70, 90], {
    extrapolateRight: 'clamp',
  });
  const palette = paletteByScene[scene];

  return (
    <AbsoluteFill
      style={{
        background: palette.bg,
        color: theme.text,
        fontFamily: 'DM Sans, system-ui, sans-serif',
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,255,136,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,204,0.05) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          opacity: 0.3,
          transform: `translateX(${drift}px)`,
        }}
      />

      <div
        style={{
          position: 'absolute',
          width: 420,
          height: 420,
          borderRadius: 999,
          top: -170,
          right: -100,
          background: palette.glow,
          filter: 'blur(44px)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 48,
          borderBottom: `1px solid ${theme.border}`,
          background: 'rgba(0,0,0,0.45)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 48,
          borderTop: `1px solid ${theme.border}`,
          background: 'rgba(0,0,0,0.5)',
        }}
      />

      {children}
    </AbsoluteFill>
  );
};

const fadeUpStyle = (frame, start, distance = 24, span = 14) => {
  const opacity = interpolate(frame, [start, start + span], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const y = interpolate(frame, [start, start + span], [distance, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return {
    opacity,
    transform: `translateY(${y}px)`,
  };
};

const Kicker = ({children, color = theme.cyan}) => (
  <div
    style={{
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 17,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      color,
    }}
  >
    {children}
  </div>
);

const Title = ({children, size = 64, maxWidth = 940}) => (
  <div
    style={{
      fontFamily: 'Oxanium, sans-serif',
      fontWeight: 800,
      fontSize: size,
      lineHeight: 1.05,
      maxWidth,
      marginTop: 12,
      letterSpacing: 0.2,
    }}
  >
    {children}
  </div>
);

const IntroScene = () => {
  const frame = useCurrentFrame();
  const titleY = interpolate(frame, [0, 34], [170, 0], {
    extrapolateRight: 'clamp',
  });
  const subtitleY = interpolate(frame, [10, 42], [140, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <SceneShell scene="intro">
      <AbsoluteFill style={{padding: '110px 84px 76px 84px', justifyContent: 'center'}}>
        <div style={fadeUpStyle(frame, 0)}>
          <Kicker>SaaS Lead Engine</Kicker>
        </div>

        <div style={{overflow: 'hidden', height: 126, marginTop: 8}}>
          <div
            style={{
              transform: `translateY(${titleY}px)`,
              fontFamily: 'Oxanium, sans-serif',
              fontSize: 112,
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: 0.4,
            }}
          >
            GrabClientsNow
          </div>
        </div>

        <div style={{overflow: 'hidden', height: 72}}>
          <div
            style={{
              transform: `translateY(${subtitleY}px)`,
              fontSize: 40,
              color: theme.muted,
              lineHeight: 1.1,
            }}
          >
            Catch clients before your competitors do.
          </div>
        </div>

        <div style={{...fadeUpStyle(frame, 28), marginTop: 16, fontSize: 30, color: '#cbe6d8', maxWidth: 920}}>
          Monitoring command center for Facebook groups with fast setup and real-time lead response.
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

const groupsMock = [
  'Dallas Home Services Network',
  'Austin Local Contractors',
  'Houston Urgent Home Help',
  'Phoenix Plumbing and HVAC Leads',
  'Orlando Roofing and Remodel',
  'Seattle Home Repair Requests',
];

const GroupsScene = () => {
  const frame = useCurrentFrame();
  const selected = Math.min(groupsMock.length, Math.max(0, Math.floor((frame - 28) / 18)));

  return (
    <SceneShell scene="groups">
      <AbsoluteFill style={{padding: '90px 80px 72px 80px'}}>
        <div style={fadeUpStyle(frame, 0)}>
          <Kicker>Guided Setup - Step 1</Kicker>
        </div>
        <div style={fadeUpStyle(frame, 6)}>
          <Title size={56}>Select the groups you want to monitor.</Title>
        </div>

        <div
          style={{
            ...fadeUpStyle(frame, 12),
            marginTop: 24,
            borderRadius: 20,
            border: `1px solid ${theme.border}`,
            background: 'rgba(8,20,13,0.93)',
            padding: 16,
            height: 530,
          }}
        >
          <div style={{display: 'flex', gap: 10, marginBottom: 12}}>
            <button
              style={{
                border: `1px solid ${theme.borderHover}`,
                background: theme.surface2,
                color: theme.text,
                borderRadius: 10,
                padding: '9px 14px',
                fontSize: 18,
              }}
            >
              Load groups
            </button>
            <button
              style={{
                border: `1px solid ${theme.border}`,
                background: theme.surface,
                color: theme.muted,
                borderRadius: 10,
                padding: '9px 14px',
                fontSize: 18,
              }}
            >
              Select visible
            </button>
            <div style={{marginLeft: 'auto', color: theme.muted, fontSize: 19, alignSelf: 'center'}}>
              Loaded: {groupsMock.length} | Selected: {selected}
            </div>
          </div>

          <div style={{display: 'grid', gap: 10}}>
            {groupsMock.map((group, index) => {
              const rowEnter = fadeUpStyle(frame, 16 + index * 4, 12, 8);
              const isSelected = index < selected;

              return (
                <div
                  key={group}
                  style={{
                    ...rowEnter,
                    borderRadius: 12,
                    border: `1px solid ${isSelected ? theme.green : theme.border}`,
                    background: isSelected ? theme.surface3 : theme.surface,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: `1px solid ${isSelected ? theme.green : theme.borderHover}`,
                      background: isSelected ? theme.green : 'transparent',
                    }}
                  />
                  <div style={{fontSize: 22}}>{group}</div>
                  <div style={{marginLeft: 'auto', fontSize: 14, color: theme.muted}}>active group</div>
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

const positiveKeywords = [
  'need plumber today',
  'roof repair quote',
  'hvac service near me',
  'water leak emergency',
  'licensed electrician',
];

const negativeKeywords = ['job offer', 'hiring', 'selling tools', 'spam'];

const KeywordChip = ({text, delay, type = 'positive'}) => {
  const frame = useCurrentFrame();
  const show = fadeUpStyle(frame, delay, 12, 10);
  const isPositive = type === 'positive';

  return (
    <div
      style={{
        ...show,
        padding: '8px 12px',
        borderRadius: 999,
        border: `1px solid ${isPositive ? '#2d8a56' : '#6f5518'}`,
        background: isPositive ? '#0f2a1b' : theme.warnDim,
        fontSize: 20,
        color: isPositive ? '#d2f7e2' : '#f2cf96',
      }}
    >
      {text}
    </div>
  );
};

const KeywordsScene = () => {
  const frame = useCurrentFrame();

  return (
    <SceneShell scene="keywords">
      <AbsoluteFill style={{padding: '90px 80px 72px 80px'}}>
        <div style={fadeUpStyle(frame, 0)}>
          <Kicker color={theme.warn}>Guided Setup - Step 2</Kicker>
        </div>
        <div style={fadeUpStyle(frame, 6)}>
          <Title size={56}>Choose the keywords that define real buyer intent.</Title>
        </div>

        <div
          style={{
            ...fadeUpStyle(frame, 12),
            marginTop: 24,
            borderRadius: 20,
            border: `1px solid ${theme.border}`,
            background: 'rgba(10,20,13,0.92)',
            minHeight: 530,
            padding: 18,
          }}
        >
          <div style={{fontSize: 22, color: theme.muted}}>Watch for (positive keywords)</div>
          <div
            style={{
              marginTop: 12,
              borderRadius: 12,
              border: `1px solid ${theme.borderHover}`,
              background: theme.surface,
              padding: '12px 14px',
              fontSize: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            Type and press Enter: <span style={{color: theme.cyan}}>need emergency plumber</span>
            <span className="blink-cursor" style={{color: theme.green}}>|</span>
          </div>

          <div style={{display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14}}>
            {positiveKeywords.map((kw, index) => (
              <KeywordChip key={kw} text={kw} delay={18 + index * 8} />
            ))}
          </div>

          <div style={{fontSize: 22, color: theme.muted, marginTop: 28}}>Exclude words (negative keywords)</div>
          <div style={{display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14}}>
            {negativeKeywords.map((kw, index) => (
              <KeywordChip key={kw} text={kw} delay={58 + index * 8} type="negative" />
            ))}
          </div>

          <div style={{marginTop: 24, color: '#c8e6d4', fontSize: 22}}>
            Use selected groups only. Refine your keywords weekly.
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

const notifications = [
  {title: 'Emergency plumber needed', body: 'Plano, TX - same-day request'},
  {title: 'Roof leak after storm', body: 'Frisco, TX - licensed roofer needed'},
  {title: 'HVAC stopped cooling', body: 'Dallas, TX - urgent homeowner post'},
  {title: 'Water heater replacement', body: 'Arlington, TX - quote request'},
  {title: 'Electrical panel issue', body: 'Irving, TX - available tech requested'},
  {title: 'Drain backup reported', body: 'Garland, TX - high-intent lead'},
  {title: 'Need emergency electrician', body: 'Plano, TX - “ASAP please”'},
  {title: 'AC not working tonight', body: 'McKinney, TX - weekend service'},
  {title: 'Pipe burst in garage', body: 'Mesquite, TX - immediate help'},
  {title: 'Hot water outage', body: 'Allen, TX - replacement quote'},
  {title: 'Roof estimate needed', body: 'Denton, TX - posted 2 min ago'},
  {title: 'Leak under kitchen sink', body: 'Richardson, TX - local pro needed'},
];

const MobileScene = () => {
  const frame = useCurrentFrame();
  const itemHeight = 88;
  const viewportHeight = 500;
  const contentHeight = notifications.length * itemHeight;
  const maxScroll = Math.max(0, contentHeight - viewportHeight);

  const scrollY = interpolate(frame, [26, DURATIONS.mobile - 10], [0, maxScroll], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <SceneShell scene="mobile">
      <AbsoluteFill style={{padding: '90px 80px 72px 80px', flexDirection: 'row'}}>
        <div style={{width: '43%', display: 'flex', flexDirection: 'column'}}>
          <div style={fadeUpStyle(frame, 0)}>
            <Kicker>Step 3 - Mobile Notifications</Kicker>
          </div>
          <div style={fadeUpStyle(frame, 6)}>
            <Title size={54} maxWidth={500}>Live feed scrolling with every new opportunity.</Title>
          </div>
          <div style={{...fadeUpStyle(frame, 16), marginTop: 16, fontSize: 28, color: theme.muted, maxWidth: 500}}>
            Alerts keep moving so your team can grab the next call first.
          </div>
        </div>

        <div style={{width: '57%', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
          <div
            className="float-soft"
            style={{
              width: 388,
              height: 650,
              borderRadius: 44,
              border: '2px solid #1b1f22',
              background: '#0f1417',
              padding: 14,
              boxShadow: '0 28px 64px rgba(0,0,0,0.45)',
            }}
          >
            <div
              style={{
                height: '100%',
                borderRadius: 32,
                background: 'linear-gradient(180deg, #e4f5eb 0%, #eef6f2 100%)',
                padding: 12,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: 40,
                  borderRadius: 10,
                  background: 'linear-gradient(90deg, #d4efe1 0%, #e8f4ed 100%)',
                  border: '1px solid #c6e4d5',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#1d5b3d',
                }}
              >
                Notification Center • Live
              </div>

              <div
                style={{
                  marginTop: 10,
                  height: viewportHeight,
                  overflow: 'hidden',
                  borderRadius: 12,
                  border: '1px solid #d1e6db',
                  background: '#f3f8f5',
                }}
              >
                <div style={{transform: `translateY(-${scrollY}px)`, padding: 8, display: 'grid', gap: 8}}>
                  {notifications.map((item, index) => {
                    const enter = interpolate(frame, [index * 6, index * 6 + 10], [0, 1], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                    });
                    const x = interpolate(frame, [index * 6, index * 6 + 10], [36, 0], {
                      extrapolateLeft: 'clamp',
                      extrapolateRight: 'clamp',
                    });

                    return (
                      <div
                        key={item.title + String(index)}
                        style={{
                          opacity: 0.72 + enter * 0.28,
                          transform: `translateX(${x}px)`,
                          borderRadius: 12,
                          background: '#ffffff',
                          color: '#0f1d15',
                          padding: '10px 11px',
                          border: '1px solid #d6e8de',
                          boxShadow: '0 5px 10px rgba(0,0,0,0.08)',
                          minHeight: itemHeight - 8,
                        }}
                      >
                        <div style={{fontSize: 11, fontWeight: 700, color: '#1d5b3d'}}>GrabClientsNow • Telegram</div>
                        <div style={{fontSize: 13, fontWeight: 700, marginTop: 2, lineHeight: 1.2}}>{item.title}</div>
                        <div style={{fontSize: 12, marginTop: 2, lineHeight: 1.25}}>{item.body}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

const LeadCard = ({title, group, delay}) => {
  const frame = useCurrentFrame();
  const show = fadeUpStyle(frame, delay, 12, 9);

  return (
    <div
      style={{
        ...show,
        borderRadius: 14,
        border: `1px solid ${theme.border}`,
        background: 'rgba(10,22,15,0.95)',
        padding: 14,
      }}
    >
      <div style={{fontSize: 13, color: theme.muted}}>{group}</div>
      <div style={{fontSize: 22, marginTop: 5, lineHeight: 1.25}}>{title}</div>
      <div style={{marginTop: 8, color: theme.green, fontWeight: 700, fontSize: 16}}>Lead detected • high intent</div>
      <div style={{marginTop: 8, height: 2, borderRadius: 4}} className="shimmer-line" />
    </div>
  );
};

const LeadsScene = () => {
  const frame = useCurrentFrame();

  return (
    <SceneShell scene="leads">
      <AbsoluteFill style={{padding: '90px 80px 72px 80px', flexDirection: 'row', gap: 20}}>
        <div
          style={{
            width: '42%',
            borderRadius: 20,
            border: `1px solid ${theme.border}`,
            background: 'rgba(8,20,13,0.93)',
            padding: 18,
            ...fadeUpStyle(frame, 0),
          }}
        >
          <Kicker>System Status</Kicker>
          <Title size={44}>Monitoring is live.</Title>

          <div style={{display: 'grid', gap: 10, marginTop: 16}}>
            <div style={{fontSize: 22, color: theme.muted}}>Checking 100 selected groups</div>
            <div style={{fontSize: 22, color: theme.muted}}>Last lead: 32 seconds ago</div>
            <div style={{fontSize: 22, color: theme.green}}>7 leads in the last 24h</div>
          </div>
        </div>

        <div
          style={{
            width: '58%',
            borderRadius: 20,
            border: `1px solid ${theme.border}`,
            background: 'rgba(8,20,13,0.93)',
            padding: 18,
            ...fadeUpStyle(frame, 8),
          }}
        >
          <Kicker color={theme.green}>Leads</Kicker>
          <div style={{fontSize: 31, fontFamily: 'Oxanium, sans-serif', marginTop: 8}}>
            High-intent requests ready for your team
          </div>

          <div style={{display: 'grid', gap: 10, marginTop: 14}}>
            <LeadCard delay={20} group="Dallas Home Services Network" title="Need emergency plumber today" />
            <LeadCard delay={30} group="Austin Local Contractors" title="Looking for licensed roofer this week" />
            <LeadCard delay={40} group="Houston Urgent Home Help" title="HVAC stopped working, need help now" />
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

const CtaScene = () => {
  const frame = useCurrentFrame();
  const domainY = interpolate(frame, [0, 34], [110, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <SceneShell scene="cta">
      <AbsoluteFill style={{padding: '118px 80px 74px 80px', alignItems: 'center', textAlign: 'center'}}>
        <div style={fadeUpStyle(frame, 0)}>
          <Kicker>Ready to Scale Local Leads?</Kicker>
        </div>

        <div style={{overflow: 'hidden', height: 124, marginTop: 14}}>
          <div
            style={{
              transform: `translateY(${domainY}px)`,
              fontFamily: 'Oxanium, sans-serif',
              fontSize: 102,
              fontWeight: 800,
              lineHeight: 1,
            }}
          >
            grabclientsnow.com
          </div>
        </div>

        <div style={{...fadeUpStyle(frame, 14), marginTop: 14, fontSize: 33, color: theme.muted}}>
          Start monitoring. Catch buyers early. Close faster.
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

const sceneTransition = linearTiming({durationInFrames: TRANSITION_FRAMES});

const AudioBed = () => (
  <Audio
    src={upbeatTrack}
    trimAfter={TOTAL_FRAMES}
    volume={(f) => {
      const fadeIn = interpolate(f, [0, FPS * 1.2], [0, 0.23], {
        extrapolateRight: 'clamp',
      });
      const fadeOut = interpolate(
        f,
        [TOTAL_FRAMES - FPS * 1.2, TOTAL_FRAMES],
        [0.23, 0],
        {extrapolateLeft: 'clamp'}
      );
      return Math.min(fadeIn, fadeOut);
    }}
  />
);

export const ExtensionPromoVideo = () => {
  return (
    <AbsoluteFill>
      <MotionStyles />
      <AudioBed />

      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={DURATIONS.intro}>
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({direction: 'from-top'})}
          timing={sceneTransition}
        />

        <TransitionSeries.Sequence durationInFrames={DURATIONS.groups}>
          <GroupsScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({direction: 'from-right'})}
          timing={sceneTransition}
        />

        <TransitionSeries.Sequence durationInFrames={DURATIONS.keywords}>
          <KeywordsScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({direction: 'from-right'})}
          timing={sceneTransition}
        />

        <TransitionSeries.Sequence durationInFrames={DURATIONS.mobile}>
          <MobileScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({direction: 'from-bottom'})}
          timing={sceneTransition}
        />

        <TransitionSeries.Sequence durationInFrames={DURATIONS.leads}>
          <LeadsScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={sceneTransition} />

        <TransitionSeries.Sequence durationInFrames={DURATIONS.cta}>
          <CtaScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

export const galleryStillFrames = {};
