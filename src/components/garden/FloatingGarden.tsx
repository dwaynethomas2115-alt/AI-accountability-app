import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
} from "react-native";
import Svg, {
  Defs,
  RadialGradient,
  LinearGradient,
  Stop,
  Ellipse,
  Path,
  G,
  Circle,
} from "react-native-svg";
import { gardenGrowth, type PlantKind } from "../../lib/garden";
import type { GardenWin } from "../../state/CompanionProvider";
export type GardenPlantVisual = {
  id: string;
  kind: PlantKind;
  stage: number;
  completions: number;
  title: string;
};
// Dry banks surround a shared watercourse; the center stays open to the pond.
export const PLOTS = [
  { x: 180, y: 238 },
  { x: 385, y: 215 },
  { x: 85, y: 265 },
  { x: 230, y: 317 },
  { x: 455, y: 283 },
  { x: 70, y: 235 },
  { x: 285, y: 210 },
  { x: 350, y: 321 },
];
const ART = {
  tree: require("../../../assets/garden/oak.png"),
  blossom: require("../../../assets/garden/blossom.png"),
  flower: require("../../../assets/garden/flower.png"),
  lavender: require("../../../assets/garden/lavender.png"),
};
function useReducedMotion() {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => live && setReduced(v))
      .catch(() => live && setReduced(true));
    const s = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      live = false;
      s.remove();
    };
  }, []);
  return reduced;
}
function Seedling() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 120 140">
      <Defs>
        <LinearGradient id="seed-leaf" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#D1DA88" />
          <Stop offset=".5" stopColor="#88A34E" />
          <Stop offset="1" stopColor="#49662D" />
        </LinearGradient>
      </Defs>
      <Ellipse cx={60} cy={130} rx={26} ry={5} fill="#43572F" opacity={0.16} />
      <Path
        d="M60 130 Q56 92 63 61"
        stroke="#708B3D"
        strokeWidth={4}
        fill="none"
      />
      <Path
        d="M61 98 Q19 98 17 55 Q58 54 61 98 M62 77 Q100 78 104 36 Q66 35 62 77"
        fill="url(#seed-leaf)"
      />
      <Path
        d="M61 98 L24 61 M63 77 L98 42"
        stroke="#D5DB8D"
        strokeWidth={1}
        fill="none"
      />
    </Svg>
  );
}
function GrowingPlant({
  plant,
  index,
  win,
  reduced,
}: {
  plant: GardenPlantVisual;
  index: number;
  win: GardenWin | null;
  reduced: boolean | null;
}) {
  const p = PLOTS[index]!;
  const tree = plant.kind === "tree" || plant.kind === "blossom";
  const depth = index >= 5 ? 0.65 : 1;
  // Keep even a mature tree inside its bank when a goal owns an edge plot.
  const size = Math.min(
    (tree ? (plant.kind === "tree" ? 230 : 195) : 128) * depth,
    (2 * Math.min(p.x, 520 - p.x)) / 1.16,
    p.y / (0.94 * 1.16),
  );
  const sprout = plant.stage < 2;
  const youngScale = tree ? gardenGrowth(3) : 0.25 + 0.75 * gardenGrowth(3);
  const seedSize = Math.min(64 * depth, size * youngScale * 0.9);
  const box = sprout ? seedSize : size;
  const growth = (count: number) =>
    tree ? gardenGrowth(count) : 0.25 + 0.75 * gardenGrowth(count);
  const from = win?.goalId === plant.id ? win.before : plant.completions;
  const earlyScale = (count: number) =>
    count <= 0 ? 0 : count === 1 ? 0.8 : 1;
  const target = sprout
    ? earlyScale(plant.completions)
    : growth(plant.completions);
  const initial =
    from < 3
      ? (seedSize * earlyScale(from)) / box
      : (size * growth(from)) / box;
  const scale = useRef(new Animated.Value(initial)).current;
  const previous = useRef({ box, target: initial });
  useEffect(() => {
    if (reduced === null) return;
    // Keep the root and apparent size stable when a seedling becomes its plant.
    if (previous.current.box !== box)
      scale.setValue((previous.current.target * previous.current.box) / box);
    const animation = Animated.timing(scale, {
      toValue: target,
      duration: reduced ? 0 : 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    previous.current = { box, target };
    return () => animation.stop();
  }, [target, box, reduced, scale]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: `${(box / 520) * 100}%`,
        height: `${(box / 510) * 100}%`,
        left: `${((p.x - box * 0.5) / 520) * 100}%`,
        top: `${((p.y - box * 0.94) / 510) * 100}%`,
        transformOrigin: "50% 94%",
        transform: [{ scale }],
      }}
    >
      {sprout ? (
        <Seedling />
      ) : (
        <Image
          source={ART[plant.kind]}
          resizeMode="contain"
          style={styles.art}
          fadeDuration={0}
          accessibilityElementsHidden
        />
      )}
    </Animated.View>
  );
}
/** Soft contact shadows join each growing plant to the same sunlit ground. */
function PlantGround({ plants }: { plants: GardenPlantVisual[] }) {
  return (
    <Svg
      pointerEvents="none"
      accessible={false}
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      viewBox="0 0 520 510"
    >
      <Defs>
        <RadialGradient id="plant-contact">
          <Stop offset="0" stopColor="#33432B" stopOpacity=".38" />
          <Stop offset=".55" stopColor="#405336" stopOpacity=".16" />
          <Stop offset="1" stopColor="#405336" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      {plants.slice(0, 8).map((plant, index) => {
        if (!plant.stage) return null;
        const plot = PLOTS[index]!;
        const size = Math.min(1.1, 0.3 + gardenGrowth(plant.completions));
        return (
          <Ellipse
            key={plant.id}
            cx={plot.x + 5}
            cy={plot.y + 1}
            rx={36 * size}
            ry={11 * size}
            fill="url(#plant-contact)"
          />
        );
      })}
    </Svg>
  );
}
function GrowthLight({
  win,
  reduced,
}: {
  win: GardenWin;
  reduced: boolean | null;
}) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced === null) return;
    a.setValue(0);
    const animation = Animated.sequence([
      Animated.timing(a, {
        toValue: 1,
        duration: reduced ? 0 : 500,
        useNativeDriver: true,
      }),
      Animated.delay(reduced ? 900 : 1500),
      Animated.timing(a, {
        toValue: 2,
        duration: reduced ? 0 : 1300,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [win.id, reduced, a]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          opacity: a.interpolate({
            inputRange: [0, 1, 2],
            outputRange: [0, 0.85, 0],
          }),
          transform: [
            {
              translateY: a.interpolate({
                inputRange: [0, 2],
                outputRange: [8, reduced ? 8 : -14],
              }),
            },
          ],
        },
      ]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 520 510">
        <Defs>
          <RadialGradient id="win-glow">
            <Stop offset="0" stopColor="#FFF5C5" stopOpacity=".75" />
            <Stop offset="1" stopColor="#FFF5C5" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx={260} cy={248} rx={228} ry={166} fill="url(#win-glow)" />
        {Array.from({ length: 17 }, (_, i) => {
          const x = 62 + ((i * 79) % 394),
            y = 132 + ((i * 47) % 185);
          return (
            <G key={i} transform={`translate(${x} ${y})`}>
              <Path
                d="M0 -5 Q1 -1 5 0 Q1 1 0 5 Q-1 1 -5 0 Q-1 -1 0 -5"
                fill="#FFF6D4"
              />
              <Circle cx={-7} cy={13} r={1.5} fill="#EDD28D" />
            </G>
          );
        })}
      </Svg>
    </Animated.View>
  );
}
export const FloatingGarden = React.memo(function FloatingGarden({
  plants,
  compact = false,
  win = null,
}: {
  plants: GardenPlantVisual[];
  compact?: boolean;
  win?: GardenWin | null;
}) {
  const reduced = useReducedMotion();
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced !== false) {
      float.setValue(0);
      return;
    }
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 4300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 4300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [float, reduced]);
  const grown = plants.filter((p) => p.stage > 0);
  const summary = grown.length
    ? grown
        .map(
          (p) =>
            `${p.title}: ${["grass", "sprout", "young plant", "growing plant", "fully grown plant"][p.stage]}, ${p.completions} completed ${p.completions === 1 ? "day" : "days"}`,
        )
        .join(". ")
    : "Just grass. Your garden will grow as you complete your goals.";
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Your floating garden. ${summary} A pond and stream flow between the grassy banks into a waterfall.`}
      style={[styles.frame, compact && styles.compact]}
    >
      <Svg
        style={StyleSheet.absoluteFill}
        width="100%"
        height="100%"
        viewBox="0 0 520 510"
      >
        <Defs>
          <RadialGradient id="sky">
            <Stop offset="0" stopColor="#F0E5BF" stopOpacity=".7" />
            <Stop offset="1" stopColor="#F8F5EF" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx={215} cy={220} rx={280} ry={230} fill="url(#sky)" />
        <Ellipse
          cx={255}
          cy={495}
          rx={128}
          ry={9}
          fill="#8F9F89"
          opacity={0.11}
        />
      </Svg>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [
              {
                translateY: float.interpolate({
                  inputRange: [0, 1],
                  outputRange: [3, -3],
                }),
              },
            ],
          },
        ]}
      >
        <Image
          source={require("../../../assets/garden/island.png")}
          style={styles.art}
          resizeMode="contain"
          fadeDuration={0}
          accessibilityElementsHidden
        />
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: float.interpolate({
                inputRange: [0, 1],
                outputRange: [0.08, 0.3],
              }),
            },
          ]}
        >
          <Svg
            accessible={false}
            width="100%"
            height="100%"
            viewBox="0 0 520 510"
          >
            <Path
              d="M283 260 Q307 267 331 260 M300 273 Q323 280 349 273 M337 247 Q350 251 363 247"
              fill="none"
              stroke="#EDF6E4"
              strokeWidth={1}
              strokeLinecap="round"
            />
          </Svg>
        </Animated.View>
        <PlantGround plants={plants} />
        {plants
          .slice(0, 8)
          .map((plant, index) => ({ plant, index }))
          .sort((a, b) => PLOTS[a.index]!.y - PLOTS[b.index]!.y)
          .map(
            ({ plant, index }) =>
              plant.stage > 0 && (
                <GrowingPlant
                  key={plant.id}
                  plant={plant}
                  index={index}
                  win={win}
                  reduced={reduced}
                />
              ),
          )}
        {win && <GrowthLight key={win.id} win={win} reduced={reduced} />}
      </Animated.View>
    </View>
  );
});
const styles = StyleSheet.create({
  art: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  frame: { width: "100%", aspectRatio: 520 / 510 },
  compact: { maxWidth: 270, alignSelf: "center" },
});
