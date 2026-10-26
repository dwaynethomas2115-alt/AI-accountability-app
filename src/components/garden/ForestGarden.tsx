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

// One shared planting plan, with roots on the banks rather than over the water.
// These coordinates use the same portrait canvas as the meadow and forest art.
const PLACES = [
  { x: 0.25, y: 0.69, depth: 1 },
  { x: 0.8, y: 0.755, depth: 0.9 },
  { x: 0.32, y: 0.555, depth: 0.44 },
  { x: 0.87, y: 0.615, depth: 0.48 },
  { x: 0.08, y: 0.79, depth: 0.68 },
  { x: 0.94, y: 0.865, depth: 0.63 },
  { x: 0.32, y: 0.92, depth: 0.75 },
  { x: 0.6, y: 0.965, depth: 0.6 },
  // Smaller flowers form the understory, irrespective of goal creation order.
  { x: 0.14, y: 0.855, depth: 0.76 },
  { x: 0.63, y: 0.875, depth: 0.78 },
  { x: 0.87, y: 0.92, depth: 0.74 },
  { x: 0.35, y: 0.965, depth: 0.65 },
  { x: 0.09, y: 0.68, depth: 0.5 },
  { x: 0.84, y: 0.73, depth: 0.5 },
  { x: 0.37, y: 0.61, depth: 0.45 },
  { x: 0.54, y: 0.91, depth: 0.48 },
  { x: 0.12, y: 0.93, depth: 0.55 },
  { x: 0.75, y: 0.95, depth: 0.5 },
] as const;

function plantings(plants: GardenPlantVisual[]) {
  const visible = plants.slice(0, 8);
  const firstOak = visible.find((plant) => plant.kind === "tree")?.id;
  const firstBlossom = visible.find((plant) => plant.kind === "blossom")?.id;
  // Keep the two main sites reserved even before that kind of tree is planted.
  // A new oak must not displace an established blossom to another bed.
  const remainingCanopy = [2, 3, 4, 5, 6, 7, 16, 17];
  let canopy = 0;
  let understory = 8;
  return visible
    .map((plant) => ({
      plant,
      index:
        plant.id === firstOak
          ? 0
          : plant.id === firstBlossom
            ? 1
            : plant.kind === "tree" || plant.kind === "blossom"
              ? remainingCanopy[canopy++]!
              : understory++,
    }))
    .sort((a, b) => PLACES[a.index]!.y - PLACES[b.index]!.y);
}
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
    height * (tree ? (plant.kind === "tree" ? 0.48 : 0.4) : 0.18) * place.depth,
    width * (tree ? 1.05 : 0.38),
    (rootY - height * 0.22) / (0.965 * 1.16),
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

function PlantingBed({
  plant,
  index,
  width,
  height,
}: {
  plant: GardenPlantVisual;
  index: number;
  width: number;
  height: number;
}) {
  const g = geometry(plant, index, width, height);
  const bedWidth = Math.max(44, g.boxWidth * g.target * 1.12);
  const bedHeight = bedWidth * 0.48;
  return (
    <Image
      pointerEvents="none"
      source={require("../../../assets/forest/understory.png")}
      resizeMode="contain"
      fadeDuration={0}
      accessibilityElementsHidden
      style={{
        position: "absolute",
        left: g.rootX - bedWidth / 2,
        top: g.rootY - bedHeight * 0.48,
        width: bedWidth,
        height: bedHeight,
        opacity: Math.min(1, 0.55 + gardenGrowth(plant.completions) * 0.45),
      }}
    />
  );
}

/** A physical little marker: the board sits on a stake, with leaves at its foot. */
function GardenSign({ title, days }: { title: string; days: number }) {
  return (
    <>
      <Svg
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        width="100%"
        height="100%"
        viewBox="0 0 120 66"
        preserveAspectRatio="none"
        accessible={false}
      >
        <Defs>
          <LinearGradient id="garden-sign-wood" x1="0" y1="0" x2="0.2" y2="1">
            <Stop offset="0" stopColor="#E6CCA1" />
            <Stop offset=".52" stopColor="#D4B581" />
            <Stop offset="1" stopColor="#BFA072" />
          </LinearGradient>
          <LinearGradient id="garden-sign-stake" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#7B6847" />
            <Stop offset=".45" stopColor="#B2925E" />
            <Stop offset="1" stopColor="#8D734E" />
          </LinearGradient>
        </Defs>
        <Ellipse
          cx={63}
          cy={62}
          rx={21}
          ry={3}
          fill="#1B3725"
          fillOpacity=".26"
        />
        <Path
          d="M56 35 L65 35 L63 63 L59 65 L57 61Z"
          fill="url(#garden-sign-stake)"
        />
        <Path d="M5 7 L115 4 L117 44 L6 47Z" fill="#59472F" fillOpacity=".20" />
        <Path
          d="M3 4 L115 1 L117 42 L5 45 L2 28Z"
          fill="url(#garden-sign-wood)"
          stroke="#B4986D"
          strokeWidth=".7"
        />
        <Path
          d="M6 5 L112 2 M8 43 L114 40"
          stroke="#F4E1BE"
          strokeOpacity=".6"
          strokeWidth=".8"
        />
        <Path
          d="M7 10 Q35 7 55 9 T112 7 M8 36 Q37 32 66 35 T113 33 M12 39 Q57 36 101 38"
          stroke="#8E7048"
          strokeOpacity=".13"
          strokeWidth=".7"
          fill="none"
        />
        <Circle cx={9} cy={23} r={1} fill="#826D4D" />
        <Circle cx={110} cy={20} r={1} fill="#826D4D" />
        <Path
          d="M60 64 Q45 64 42 54 Q53 51 60 64 M62 64 Q69 52 80 55 Q78 65 62 64 M58 63 Q52 53 54 49 Q62 53 61 63"
          fill="#587443"
        />
        <Path
          d="M61 64 L46 56 M61 64 L75 57"
          stroke="#99AE62"
          strokeWidth=".6"
        />
      </Svg>
      <View pointerEvents="none" style={styles.signWriting}>
        <Text numberOfLines={2} style={styles.labelTitle}>
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.labelProgress}>
          {days} {days === 1 ? "day" : "days"} of care
        </Text>
      </View>
    </>
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
  totalCare = plants.reduce((sum, plant) => sum + plant.completions, 0),
  compact = false,
  win = null,
  onPlantPress,
  selectedPlantId = null,
}: {
  plants: GardenPlantVisual[];
  height: number;
  totalCare?: number;
  compact?: boolean;
  win?: GardenWin | null;
  onPlantPress?: (id: string) => void;
  selectedPlantId?: string | null;
}) {
  const window = useWindowDimensions();
  const [width, setWidth] = useState(Math.min(window.width, 520));
  const reduced = useReducedMotion();
  const breeze = useRef(new Animated.Value(0.5)).current;
  // Care from every goal fills in the same landscape. Adding an unstarted goal
  // or looking at another garden area never takes the surrounding growth away.
  const fullness = Math.min(
    1,
    Math.log1p(Math.max(0, totalCare)) / Math.log1p(70),
  );
  const forestOpacity = useRef(new Animated.Value(fullness)).current;
  useEffect(() => {
    if (reduced === null) return;
    const animation = Animated.timing(forestOpacity, {
      toValue: fullness,
      duration: reduced ? 0 : 1600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [fullness, forestOpacity, reduced]);
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
  const placed = plantings(plants);
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
          source={require("../../../assets/forest/meadow.png")}
          style={styles.art}
          resizeMode="stretch"
          fadeDuration={0}
          accessibilityElementsHidden
        />
        <Animated.Image
          source={require("../../../assets/forest/clearing.png")}
          style={[styles.art, { opacity: forestOpacity }]}
          resizeMode="stretch"
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
        </Svg>
        {grown.map(({ plant, index }) => (
          <React.Fragment key={plant.id}>
            <GrowingPlant
              plant={plant}
              index={index}
              width={width}
              height={height}
              win={win}
              reduced={reduced}
              breeze={breeze}
            />
            <PlantingBed
              plant={plant}
              index={index}
              width={width}
              height={height}
            />
          </React.Fragment>
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
              <Stop offset=".16" stopColor="#F8F5EF" stopOpacity="1" />
              <Stop offset=".23" stopColor="#F8F5EF" stopOpacity=".82" />
              <Stop offset=".32" stopColor="#F8F5EF" stopOpacity="0" />
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
          const top = Math.max(166, g.rootY - g.boxHeight * g.target * 0.88);
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
            122,
            Math.max(90, plant.title.length * 4.5 + 24),
          );
          const signRoot = g.rootX + (g.rootX > width * 0.6 ? -24 : 24);
          const left = Math.max(
            8,
            Math.min(width - tagWidth - 8, signRoot - tagWidth / 2),
          );
          const top = Math.min(g.rootY - 26, height - 70);
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
              <GardenSign title={plant.title} days={plant.completions} />
            </Pressable>
          );
        })()}
    </View>
  );
});

const styles = StyleSheet.create({
  plantLabel: {
    position: "absolute",
    height: 66,
    transform: [{ rotate: "-3deg" }],
  },
  signWriting: {
    position: "absolute",
    top: 3,
    left: 11,
    right: 11,
    height: 39,
    justifyContent: "center",
    gap: 1,
  },
  labelTitle: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "600",
    textAlign: "center",
    color: "#403F28",
  },
  labelProgress: {
    fontSize: 8,
    lineHeight: 10,
    color: "#565035",
    textAlign: "center",
  },
  frame: { width: "100%", overflow: "hidden", backgroundColor: "#F8F5EF" },
  art: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  plantTarget: { position: "absolute", borderRadius: 100 },
  pressed: { backgroundColor: "rgba(255,246,210,0.045)" },
});
