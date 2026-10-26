import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
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

// A continuous landscape: plants take root on the clearings beside the water.
const PLACES = [
  { x: 0.25, y: 0.61, depth: 1 },
  { x: 0.81, y: 0.625, depth: 0.94 },
  { x: 0.1, y: 0.735, depth: 0.85 },
  { x: 0.43, y: 0.74, depth: 0.85 },
  { x: 0.86, y: 0.755, depth: 0.8 },
  { x: 0.52, y: 0.54, depth: 0.48 },
  { x: 0.68, y: 0.705, depth: 0.62 },
  { x: 0.2, y: 0.795, depth: 0.58 },
] as const;
const ART = {
  tree: require("../../../assets/forest/oak.png"),
  blossom: require("../../../assets/forest/blossom.png"),
  flower: require("../../../assets/garden/flower.png"),
  lavender: require("../../../assets/garden/lavender.png"),
};
const STAGES = [
  "grass",
  "sprout",
  "young plant",
  "growing plant",
  "fully grown plant",
];

function useReducedMotion() {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => live && setReduced(value))
      .catch(() => live && setReduced(true));
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

function geometry(
  plant: GardenPlantVisual,
  index: number,
  width: number,
  height: number,
) {
  const place = PLACES[index]!;
  const tree = plant.kind === "tree" || plant.kind === "blossom";
  const rootX = place.x * width;
  const rootY = place.y * height;
  const matureHeight = Math.min(
    height * (tree ? (plant.kind === "tree" ? 0.6 : 0.53) : 0.24) * place.depth,
    width * (tree ? 1.38 : 0.5),
    (rootY - 32) / (0.965 * 1.16),
  );
  const early = (count: number) => (count <= 0 ? 0 : count === 1 ? 0.78 : 1);
  const growth = (count: number) =>
    tree ? gardenGrowth(count) : 0.25 + 0.75 * gardenGrowth(count);
  const seedHeight = Math.min(
    62 * place.depth,
    matureHeight * growth(3) * 0.88,
  );
  const sprout = plant.stage < 2;
  const boxHeight = sprout ? seedHeight : matureHeight;
  const boxWidth = boxHeight * (sprout ? 0.9 : tree ? 2 / 3 : 1);
  const target = sprout ? early(plant.completions) : growth(plant.completions);
  const pixelsAt = (count: number) =>
    count < 3 ? seedHeight * early(count) : matureHeight * growth(count);
  return { rootX, rootY, boxWidth, boxHeight, target, pixelsAt, sprout, tree };
}

function Seedling() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 120 140">
      <Defs>
        <LinearGradient id="forest-seed" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#D7E69B" />
          <Stop offset=".4" stopColor="#96B553" />
          <Stop offset="1" stopColor="#3B6536" />
        </LinearGradient>
      </Defs>
      <Path
        d="M60 135 Q56 92 63 61"
        stroke="#69883C"
        strokeWidth={4}
        fill="none"
      />
      <Path
        d="M61 98 Q19 98 17 55 Q58 54 61 98 M62 77 Q100 78 104 36 Q66 35 62 77"
        fill="url(#forest-seed)"
      />
      <Path
        d="M61 98 L24 61 M63 77 L98 42"
        stroke="#DFE7A5"
        strokeWidth={1}
        fill="none"
      />
    </Svg>
  );
}

function GrowingPlant({
  plant,
  index,
  width,
  height,
  win,
  reduced,
  breeze,
}: {
  plant: GardenPlantVisual;
  index: number;
  width: number;
  height: number;
  win: GardenWin | null;
  reduced: boolean | null;
  breeze: Animated.Value;
}) {
  const g = geometry(plant, index, width, height);
  const from = win?.goalId === plant.id ? win.before : plant.completions;
  const initial = g.pixelsAt(from) / g.boxHeight;
  const scale = useRef(new Animated.Value(initial)).current;
  const previous = useRef({ height: g.boxHeight, target: initial });
  useEffect(() => {
    if (reduced === null) return;
    if (previous.current.height !== g.boxHeight)
      scale.setValue(
        (previous.current.target * previous.current.height) / g.boxHeight,
      );
    const animation = Animated.timing(scale, {
      toValue: g.target,
      duration: reduced ? 0 : 1400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    previous.current = { height: g.boxHeight, target: g.target };
    return () => animation.stop();
  }, [g.target, g.boxHeight, reduced, scale]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: g.boxWidth,
        height: g.boxHeight,
        left: g.rootX - g.boxWidth / 2,
        top: g.rootY - g.boxHeight * 0.965,
        transformOrigin: "50% 96.5%",
        transform: [
          { scale },
          {
            rotate: breeze.interpolate({
              inputRange: [0, 1],
              outputRange:
                index % 2 ? ["0.15deg", "-0.15deg"] : ["-0.15deg", "0.15deg"],
            }),
          },
        ],
      }}
    >
      {g.sprout ? (
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

function GrowthLight({
  win,
  width,
  height,
  index,
  reduced,
}: {
  win: GardenWin;
  width: number;
  height: number;
  index: number;
  reduced: boolean | null;
}) {
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced === null) return;
    glow.setValue(0);
    const animation = Animated.sequence([
      Animated.timing(glow, {
        toValue: 1,
        duration: reduced ? 0 : 500,
        useNativeDriver: true,
      }),
      Animated.delay(1000),
      Animated.timing(glow, {
        toValue: 0,
        duration: reduced ? 0 : 1500,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [glow, reduced, win.id]);
  const place = PLACES[Math.max(0, index)]!;
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity: glow }]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <RadialGradient id="forest-win">
            <Stop offset="0" stopColor="#FFF1B5" stopOpacity=".52" />
            <Stop offset="1" stopColor="#FFF1B5" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse
          cx={place.x * width}
          cy={place.y * height - 35}
          rx={110}
          ry={135}
          fill="url(#forest-win)"
        />
        {[
          [-25, -34],
          [20, -66],
          [37, -14],
          [-34, -84],
          [12, -112],
        ].map(([x, y], i) => (
          <G
            key={i}
            transform={`translate(${place.x * width + x!} ${place.y * height + y!})`}
          >
            <Path
              d="M0 -4 Q1 -1 4 0 Q1 1 0 4 Q-1 1 -4 0 Q-1 -1 0 -4"
              fill="#FFF5D1"
            />
          </G>
        ))}
      </Svg>
    </Animated.View>
  );
}

export const ForestGarden = React.memo(function ForestGarden({
  plants,
  height,
  compact = false,
  win = null,
  onPlantPress,
  selectedPlantId = null,
}: {
  plants: GardenPlantVisual[];
  height: number;
  compact?: boolean;
  win?: GardenWin | null;
  onPlantPress?: (id: string) => void;
  selectedPlantId?: string | null;
}) {
  const window = useWindowDimensions();
  const [width, setWidth] = useState(Math.min(window.width, 740));
  const reduced = useReducedMotion();
  const breeze = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (reduced !== false) {
      breeze.setValue(0.5);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(breeze, {
          toValue: 1,
          duration: 6000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breeze, {
          toValue: 0,
          duration: 6000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [breeze, reduced]);
  const placed = plants
    .slice(0, 8)
    .map((plant, index) => ({ plant, index }))
    .sort((a, b) => PLACES[a.index]!.y - PLACES[b.index]!.y);
  const grown = placed.filter(({ plant }) => plant.stage > 0);
  const summary = grown.length
    ? grown
        .map(
          ({ plant: p }) =>
            `${p.title}: ${STAGES[p.stage]}, ${p.completions} completed ${p.completions === 1 ? "day" : "days"}`,
        )
        .join(". ")
    : "Just grass. Your own plants will grow in this clearing as you complete your goals.";
  const selected = !compact
    ? grown.find(({ plant }) => plant.id === selectedPlantId)
    : undefined;
  return (
    <View
      testID="forest-scene"
      onLayout={(event) => {
        if (event.nativeEvent.layout.width > 0)
          setWidth(event.nativeEvent.layout.width);
      }}
      style={[styles.frame, { height }]}
    >
      <Pressable
        accessible={false}
        importantForAccessibility="no"
        style={StyleSheet.absoluteFill}
        onPress={() => onPlantPress?.("")}
      />
      <View
        pointerEvents="none"
        accessibilityRole="image"
        accessibilityLabel={`Your growing forest. ${summary}. Sunlight, mossy banks and a clear waterfall surround your garden.`}
        style={StyleSheet.absoluteFill}
      >
        <Image
          source={require("../../../assets/forest/clearing.png")}
          style={styles.art}
          resizeMode="cover"
          fadeDuration={0}
          accessibilityElementsHidden
        />
        <Svg
          accessible={false}
          style={StyleSheet.absoluteFill}
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
        >
          <Defs>
            <RadialGradient id="forest-ground">
              <Stop offset="0" stopColor="#1E3824" stopOpacity=".5" />
              <Stop offset="1" stopColor="#1E3824" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          {grown.map(({ plant, index }) => {
            const g = geometry(plant, index, width, height);
            return (
              <Ellipse
                key={plant.id}
                cx={g.rootX + 4}
                cy={g.rootY}
                rx={Math.max(15, g.boxWidth * g.target * 0.35)}
                ry={Math.max(4, 12 * g.target)}
                fill="url(#forest-ground)"
              />
            );
          })}
          {selectedPlantId &&
            grown
              .filter(({ plant }) => plant.id === selectedPlantId)
              .map(({ plant, index }) => {
                const p = PLACES[index]!;
                return (
                  <Ellipse
                    key={plant.id}
                    cx={p.x * width}
                    cy={p.y * height}
                    rx={23}
                    ry={7}
                    fill="#F8EDBA"
                    fillOpacity={0.2}
                    stroke="#F3E3AC"
                    strokeOpacity={0.85}
                    strokeWidth={1}
                  />
                );
              })}
        </Svg>
        {grown.map(({ plant, index }) => (
          <GrowingPlant
            key={plant.id}
            plant={plant}
            index={index}
            width={width}
            height={height}
            win={win}
            reduced={reduced}
            breeze={breeze}
          />
        ))}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: breeze.interpolate({
                inputRange: [0, 1],
                outputRange: [0.15, 0.45],
              }),
            },
          ]}
        >
          <Svg
            accessible={false}
            width="100%"
            height="100%"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
          >
            <Path
              d="M565 492 Q625 500 681 492 M620 511 Q663 517 718 511 M552 530 Q590 536 629 530"
              stroke="#EAF7D8"
              strokeWidth={1}
              fill="none"
            />
            <Circle cx={158} cy={355} r={1.4} fill="#FFF2BA" />
            <Circle cx={654} cy={304} r={1.7} fill="#FFF2BA" />
            <Circle cx={791} cy={425} r={1.2} fill="#FFF2BA" />
          </Svg>
        </Animated.View>
        {win && (
          <GrowthLight
            key={win.id}
            win={win}
            width={width}
            height={height}
            index={placed.find((p) => p.plant.id === win.goalId)?.index ?? 0}
            reduced={reduced}
          />
        )}
        <Svg
          accessible={false}
          style={StyleSheet.absoluteFill}
          width="100%"
          height="100%"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
        >
          <Defs>
            <LinearGradient id="forest-mist" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#F8F5EF" />
              <Stop offset=".11" stopColor="#F8F5EF" stopOpacity=".96" />
              <Stop offset=".24" stopColor="#F8F5EF" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect width={1000} height={1000} fill="url(#forest-mist)" />
        </Svg>
      </View>
      {!compact &&
        onPlantPress &&
        grown.map(({ plant, index }) => {
          const g = geometry(plant, index, width, height);
          const targetWidth = Math.max(44, g.boxWidth * g.target * 0.6);
          const targetHeight = Math.max(44, g.boxHeight * g.target * 0.84);
          const left = Math.min(
            width - targetWidth,
            Math.max(0, g.rootX - targetWidth / 2),
          );
          const top = Math.max(105, g.rootY - g.boxHeight * g.target * 0.88);
          return (
            <Pressable
              key={plant.id}
              accessibilityRole="button"
              accessibilityLabel={`About ${plant.title}`}
              accessibilityHint="Reveal this plant’s goal and progress."
              accessibilityState={{ selected: selectedPlantId === plant.id }}
              onPress={() =>
                onPlantPress(selectedPlantId === plant.id ? "" : plant.id)
              }
              style={({ pressed }) => [
                styles.plantTarget,
                {
                  left,
                  top,
                  width: targetWidth,
                  height: Math.min(targetHeight, height - top),
                },
                pressed && styles.pressed,
              ]}
            />
          );
        })}
      {selected &&
        onPlantPress &&
        (() => {
          const { plant, index } = selected;
          const g = geometry(plant, index, width, height);
          const tagWidth = Math.min(
            140,
            Math.max(94, plant.title.length * 5 + 26),
          );
          const left = Math.max(
            12,
            Math.min(
              width - tagWidth - 12,
              g.rootX - (g.rootX > width * 0.6 ? tagWidth - 14 : 14),
            ),
          );
          const top = Math.min(g.rootY + 5, height - 190);
          return (
            <Pressable
              testID="plant-details"
              accessibilityLiveRegion="polite"
              accessibilityRole="button"
              accessibilityLabel="Close plant details"
              accessibilityHint={`${plant.title}. ${plant.completions} completed ${plant.completions === 1 ? "day" : "days"}. Tap to tuck this label away.`}
              onPress={() => onPlantPress("")}
              style={[styles.plantLabel, { left, top, width: tagWidth }]}
            >
              <View
                pointerEvents="none"
                style={[
                  styles.labelStem,
                  {
                    left: Math.max(10, Math.min(tagWidth - 12, g.rootX - left)),
                  },
                ]}
              />
              <Text numberOfLines={2} style={styles.labelTitle}>
                {plant.title}
              </Text>
              <Text style={styles.labelProgress}>
                {plant.completions} {plant.completions === 1 ? "day" : "days"}{" "}
                of care
              </Text>
            </Pressable>
          );
        })()}
    </View>
  );
});

const styles = StyleSheet.create({
  plantLabel: {
    position: "absolute",
    minHeight: 44,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(243,247,231,0.90)",
    borderWidth: 1,
    borderColor: "rgba(213,225,194,0.65)",
    boxShadow: "0 3px 12px rgba(20,48,29,0.14)",
    gap: 2,
  },
  labelTitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: "#284C38",
  },
  labelProgress: { fontSize: 9, lineHeight: 12, color: "#52654D" },
  labelStem: {
    position: "absolute",
    top: -7,
    width: 1,
    height: 7,
    backgroundColor: "#D5DFC2",
  },
  frame: { width: "100%", overflow: "hidden", backgroundColor: "#F8F5EF" },
  art: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  plantTarget: { position: "absolute", borderRadius: 100 },
  pressed: { backgroundColor: "rgba(255,246,210,0.045)" },
});
