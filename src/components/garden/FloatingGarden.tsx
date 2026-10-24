import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Path,
  Ellipse,
  Circle,
  G,
} from "react-native-svg";
import type { PlantKind } from "../../lib/garden";

export type GardenPlantVisual = {
  id: string;
  kind: PlantKind;
  stage: number;
  title: string;
};
export const PLOTS = [
  { x: 188, y: 284 },
  { x: 360, y: 313 },
  { x: 105, y: 340 },
  { x: 278, y: 368 },
  { x: 419, y: 356 },
  { x: 63, y: 288 },
  { x: 290, y: 268 },
  { x: 182, y: 386 },
];
const random = (n: number) => {
  const x = Math.sin(n * 127.1 + 31.7) * 43758.5453;
  return x - Math.floor(x);
};
function Leaf({
  x,
  y,
  size = 9,
  angle = 0,
  color = "#718B52",
}: {
  x: number;
  y: number;
  size?: number;
  angle?: number;
  color?: string;
}) {
  return (
    <Path
      d={`M 0 0 Q ${-size} ${-size * 0.4} 0 ${-size * 2} Q ${size} ${-size * 0.4} 0 0`}
      fill={color}
      transform={`translate(${x} ${y}) rotate(${angle})`}
    />
  );
}
function Flower({
  x,
  y,
  size,
  color,
  seed = 1,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
  seed?: number;
}) {
  return (
    <G transform={`translate(${x} ${y}) rotate(${seed * 13})`}>
      {Array.from({ length: 7 }, (_, i) => (
        <Ellipse
          key={i}
          cx={0}
          cy={-size * 0.72}
          rx={size * 0.43}
          ry={size * 0.7}
          fill={i % 2 ? color : "#F8D9B9"}
          transform={`rotate(${(i * 360) / 7})`}
        />
      ))}
      <Circle r={size * 0.35} fill="#B78B42" />
      <Circle
        cx={-size * 0.1}
        cy={-size * 0.1}
        r={size * 0.15}
        fill="#E9BF67"
      />
    </G>
  );
}
function Sprout() {
  return (
    <G>
      <Path
        d="M0 0 Q-4 -16 0 -28"
        stroke="#627B40"
        strokeWidth={3}
        fill="none"
      />
      <Leaf x={-1} y={-13} size={10} angle={-53} color="#8BA85D" />
      <Leaf x={0} y={-23} size={8} angle={48} color="#B7C77C" />
    </G>
  );
}
function Tree({ stage, blossom }: { stage: number; blossom: boolean }) {
  const scale = stage === 2 ? 0.48 : stage === 3 ? 0.74 : 1;
  return (
    <G transform={`scale(${scale})`}>
      <Ellipse cx={4} cy={2} rx={45} ry={12} fill="#334D35" opacity={0.12} />
      <Path
        d="M-17 7 Q-5 -28 -10 -65 Q-13 -94 -28 -118 L-19 -122 Q0 -94 1 -74 Q8 -106 31 -125 L38 -120 Q14 -88 13 -63 Q9 -27 21 7 Q0 1 -17 7"
        fill="url(#trunk)"
      />
      <Path
        d="M-3 1 Q-5 -37 1 -66 M4 -52 Q-10 -68 -36 -89 M9 -61 Q31 -74 46 -97"
        stroke="#8E7A4D"
        strokeWidth={3}
        fill="none"
      />
      <Path
        d="M-4 -3 Q-24 7 -34 7 M8 -3 Q27 5 31 10"
        stroke="#7D724B"
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
      />
      {Array.from({ length: 15 }, (_, i) => {
        const a = i * 2.4;
        const r = Math.sqrt(i / 15);
        const x = Math.cos(a) * 78 * r;
        const y = -130 + Math.sin(a) * 43 * r;
        return (
          <Ellipse
            key={i}
            cx={x}
            cy={y}
            rx={35 + random(i) * 15}
            ry={29 + random(i + 4) * 12}
            fill={
              blossom
                ? ["#CE9691", "#E5B6A5", "#F1CEBB"][i % 3]
                : ["#667E49", "#819359", "#9FAC6E"][i % 3]
            }
          />
        );
      })}
      {Array.from({ length: 92 }, (_, i) => {
        const a = i * 2.39996;
        const r = Math.sqrt((i + 0.5) / 92);
        const x = Math.cos(a) * 105 * r;
        const y = -136 + Math.sin(a) * 64 * r;
        return blossom ? (
          <G key={i}>
            <Circle
              cx={x}
              cy={y}
              r={4 + random(i) * 5}
              fill={["#FBE4CD", "#EFC7B3", "#E6ACA1"][i % 3]}
            />
            <Circle cx={x - 1} cy={y - 1} r={1.7} fill="#F7E9C9" />
          </G>
        ) : (
          <Leaf
            key={i}
            x={x}
            y={y}
            size={5 + random(i) * 4}
            angle={-60 + random(i + 90) * 120}
            color={["#C2CA89", "#8EA462", "#ADB87A", "#768E52"][i % 4]}
          />
        );
      })}
    </G>
  );
}
function FlowerPlant({
  stage,
  lavender,
}: {
  stage: number;
  lavender: boolean;
}) {
  const scale = stage === 2 ? 0.48 : stage === 3 ? 0.76 : 1;
  return (
    <G transform={`scale(${scale})`}>
      <Ellipse cx={0} cy={2} rx={31} ry={8} fill="#334D35" opacity={0.12} />
      {Array.from({ length: lavender ? 11 : 5 }, (_, i) => {
        const x = (i - (lavender ? 5 : 2)) * (lavender ? 5 : 12);
        const height = lavender ? 52 + random(i) * 30 : 58 + random(i) * 53;
        return (
          <G key={i}>
            <Path
              d={`M${x * 0.6} 0 Q${x - 5} ${-height * 0.5} ${x} ${-height}`}
              stroke={lavender ? "#7C9060" : "#70874D"}
              strokeWidth={2.5}
              fill="none"
            />
            <Leaf
              x={x * 0.8}
              y={-height * 0.3}
              size={10}
              angle={i % 2 ? 50 : -50}
            />
            <Leaf
              x={x * 0.9}
              y={-height * 0.52}
              size={7}
              angle={i % 2 ? -50 : 50}
              color="#94A46A"
            />
            {lavender ? (
              <G>
                {Array.from({ length: 7 }, (_, j) => (
                  <Ellipse
                    key={j}
                    cx={x + (j % 2 ? 2 : -2)}
                    cy={-height + j * 4}
                    rx={4 - j * 0.2}
                    ry={4}
                    fill={["#8B79A3", "#B8A2C6", "#A18AB7"][j % 3]}
                  />
                ))}
              </G>
            ) : (
              <Flower
                x={x}
                y={-height}
                size={15 + random(i + 5) * 5}
                color={i % 2 ? "#E8A68B" : "#F0BD9D"}
                seed={i}
              />
            )}
          </G>
        );
      })}
      <Leaf x={-4} y={1} size={20} angle={-65} color="#8D9E66" />
      <Leaf x={5} y={1} size={17} angle={60} color="#A6B478" />
    </G>
  );
}
export const FloatingGarden = React.memo(function FloatingGarden({
  plants,
  compact = false,
}: {
  plants: GardenPlantVisual[];
  compact?: boolean;
}) {
  const float = useRef(new Animated.Value(0)).current;
  const [reduce, setReduce] = useState(true);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce,
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  useEffect(() => {
    if (reduce) {
      float.setValue(0);
      return;
    }
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 3700,
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 3700,
          useNativeDriver: true,
        }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [float, reduce]);
  const grown = plants.filter((p) => p.stage > 0);
  const summary = grown.length
    ? grown
        .map(
          (p) =>
            `${p.title}: ${["grass", "sprout", "young plant", "growing plant", "fully grown plant"][p.stage]}`,
        )
        .join(". ")
    : "Just grass. Your garden will grow as you complete your goals.";
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Your floating garden. ${summary}`}
      style={[styles.frame, compact && styles.compact]}
    >
      <Animated.View
        style={{
          width: "100%",
          height: "100%",
          transform: [
            {
              translateY: float.interpolate({
                inputRange: [0, 1],
                outputRange: [3, -4],
              }),
            },
          ],
        }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 520 510">
          <Defs>
            <RadialGradient id="sky" cx="40%" cy="40%" r="65%">
              <Stop offset="0" stopColor="#F4E4BD" stopOpacity=".55" />
              <Stop offset="1" stopColor="#F8F5EF" stopOpacity="0" />
            </RadialGradient>
            <LinearGradient id="stone" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#B6AF8D" />
              <Stop offset=".45" stopColor="#918D70" />
              <Stop offset="1" stopColor="#CEC1A0" />
            </LinearGradient>
            <RadialGradient id="grass" cx="33%" cy="25%" r="80%">
              <Stop offset="0" stopColor="#D9D9A0" />
              <Stop offset=".45" stopColor="#B2BF80" />
              <Stop offset="1" stopColor="#6E8759" />
            </RadialGradient>
            <LinearGradient id="trunk" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#6B6748" />
              <Stop offset=".5" stopColor="#A18C5E" />
              <Stop offset="1" stopColor="#7B7351" />
            </LinearGradient>
            <LinearGradient id="water" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#F4F6D8" stopOpacity=".85" />
              <Stop offset=".6" stopColor="#D9E8DD" stopOpacity=".5" />
              <Stop offset="1" stopColor="#F8F5EF" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Ellipse cx={245} cy={240} rx={270} ry={240} fill="url(#sky)" />
          <G opacity={0.23}>
            <Path d="M441 143 L489 147 L471 186 Z" fill="#C2B899" />
            <Ellipse cx={465} cy={143} rx={27} ry={9} fill="#BAC697" />
            <Path d="M18 220 L58 226 L41 261 Z" fill="#C2B899" />
            <Ellipse cx={37} cy={219} rx={23} ry={7} fill="#BAC697" />
          </G>
          <Ellipse
            cx={266}
            cy={483}
            rx={126}
            ry={8}
            fill="#AEB8A2"
            opacity={0.12}
          />
          <Path
            d="M40 320 L65 381 L104 406 L134 448 L189 448 L233 491 L280 475 L308 449 L365 444 L386 409 L440 384 L474 322 Z"
            fill="url(#stone)"
          />
          <Path
            d="M75 350 L117 383 L134 448 L104 406 L65 381 Z M168 369 L204 420 L233 491 L189 448 Z M310 372 L343 401 L308 449 L280 475 Z"
            fill="#73765D"
            opacity={0.32}
          />
          <Path
            d="M134 375 L145 423 L189 448 L170 404 Z M251 389 L233 491 L280 475 L276 408 Z M387 355 L365 444 L386 409 L440 384 Z"
            fill="#DED1AD"
            opacity={0.48}
          />
          <Path
            d="M40 320 Q29 287 79 265 Q135 242 194 249 Q271 220 354 250 Q439 249 476 298 Q506 334 446 359 Q361 399 267 399 Q168 408 85 368 Q39 349 40 320"
            fill="#698250"
          />
          <Path
            d="M41 311 Q38 283 84 266 Q146 240 200 250 Q274 226 350 250 Q428 250 472 296 Q494 326 449 352 Q369 384 274 386 Q175 397 91 361 Q41 344 41 311"
            fill="url(#grass)"
          />
          <Path
            d="M80 354 Q99 358 113 357 Q106 409 118 460 Q103 450 100 427 Q94 392 80 354"
            fill="url(#water)"
          />
          <Path
            d="M87 358 Q89 400 106 446 M99 362 Q97 398 111 431"
            stroke="#FFFCE4"
            strokeWidth={2}
            opacity={0.5}
            fill="none"
          />
          {Array.from({ length: 150 }, (_, i) => {
            const a = i * 2.39996;
            const r = Math.sqrt((i + 0.5) / 150);
            const x = 260 + Math.cos(a) * 208 * r;
            const y = 318 + Math.sin(a) * 61 * r;
            return (
              <Path
                key={i}
                d={`M${x - 3} ${y} q-3 -9 -6 -11 M${x} ${y} q1 -12 4 -15 M${x + 2} ${y} q5 -6 9 -7`}
                stroke={["#7A9456", "#A1B370", "#D3DA99", "#8C9D62"][i % 4]}
                strokeWidth={1.5}
                opacity={0.7}
                strokeLinecap="round"
                fill="none"
              />
            );
          })}
          {(
            [
              [60, 333, 14],
              [439, 339, 18],
              [153, 377, 12],
              [384, 371, 10],
              [73, 287, 11],
            ] as const
          ).map(([x, y, r], i) => (
            <G key={i}>
              <Ellipse cx={x} cy={y} rx={r} ry={r * 0.6} fill="#8E9678" />
              <Path
                d={`M${x - r} ${y} Q${x - 3} ${y - r * 1.5} ${x + r} ${y} Z`}
                fill={i % 2 ? "#C2BDA0" : "#D2CCAA"}
              />
            </G>
          ))}
          {[75, 160, 372, 437].map((x, i) => (
            <G key={x}>
              <Path
                d={`M${x} ${354 + (i % 2) * 21} q-12 17 -3 37 q14 12 5 28`}
                stroke="#83945B"
                strokeWidth={2}
                fill="none"
              />
              {[0, 1, 2, 3, 4].map((j) => (
                <Leaf
                  key={j}
                  x={x + (j % 2 ? 3 : -4)}
                  y={366 + (i % 2) * 21 + j * 9}
                  size={5}
                  angle={j % 2 ? 65 : -65}
                  color={j % 2 ? "#AABB75" : "#849B5F"}
                />
              ))}
            </G>
          ))}
          {plants
            .slice(0, 8)
            .map((p, i) => ({ p, plot: PLOTS[i]! }))
            .sort((a, b) => a.plot.y - b.plot.y)
            .map(
              ({ p, plot }) =>
                p.stage > 0 && (
                  <G key={p.id} transform={`translate(${plot.x} ${plot.y})`}>
                    {p.stage === 1 ? (
                      <Sprout />
                    ) : p.kind === "tree" || p.kind === "blossom" ? (
                      <Tree stage={p.stage} blossom={p.kind === "blossom"} />
                    ) : (
                      <FlowerPlant
                        stage={p.stage}
                        lavender={p.kind === "lavender"}
                      />
                    )}
                  </G>
                ),
            )}
          <G opacity={0.55}>
            <Path d="M360 465 l7 3 -2 10 -7 -5 Z" fill="#9A9478" />
            <Path d="M148 462 l5 1 4 7 -7 4 -3 -6 Z" fill="#BCB293" />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
});
const styles = StyleSheet.create({
  frame: { width: "100%", aspectRatio: 520 / 510 },
  compact: { maxWidth: 270, alignSelf: "center" },
});
