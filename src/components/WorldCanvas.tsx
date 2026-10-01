"use client";
import { useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Stars } from "@react-three/drei";
import * as THREE from "three";
import { useWorld } from "@/store/useWorldStore";
import type { GraphNode } from "@/lib/types";
import { TYPE_COLORS } from "@/components/typeColors";

function CameraRig({ controlsRef }: { controlsRef: any }) {
  const { camera } = useThree();
  const { selectedNode, searchFly, graph } = useWorld();
  const target = useRef<{ t: THREE.Vector3; c: THREE.Vector3 } | null>(null);

  useEffect(() => {
    const id = searchFly ?? selectedNode?.id;
    if (!id || !graph) { target.current = null; return; }
    const n = graph.nodes.find(x => x.id === id);
    if (!n) return;
    const t = new THREE.Vector3(...n.position);
    const dir = camera.position.clone().sub(controlsRef.current?.target ?? t).normalize();
    if (dir.lengthSq() < 0.01) dir.set(1, 0.6, 1).normalize();
    // Stand off far enough that the node and its neighbours stay in frame instead of
    // filling the viewport. Scale with the node so large hubs still read clearly.
    const dist = 22 + (0.7 + (n.importance ?? 0.5) * 2.1) * 9;
    const c = t.clone().add(dir.multiplyScalar(dist));
    target.current = { t, c };
  }, [selectedNode?.id, searchFly, graph, camera, controlsRef]);

  useFrame((_, dt) => {
    const tg = target.current;
    if (!tg || !controlsRef.current) return;
    const k = 1 - Math.exp(-4 * dt);
    controlsRef.current.target.lerp(tg.t, k);
    camera.position.lerp(tg.c, k);
    if (camera.position.distanceTo(tg.c) < 0.15) target.current = null;
  });
  return null;
}

function NodeMesh({ node, dimmed, highlighted, label }: { node: GraphNode; dimmed: boolean; highlighted: boolean; label: boolean }) {
  const { selectNode, setHovered, selectedNode } = useWorld();
  const color = TYPE_COLORS[node.type] ?? "#94a3b8";
  const size = 0.7 + node.importance * 2.1;
  const selected = selectedNode?.id === node.id;
  const labelRef = useRef<any>(null);

  // Hold the label at a roughly constant on-screen size. World-space text scales
  // with distance, so we counter-scale by the camera distance each frame.
  useFrame(({ camera }) => {
    const t = labelRef.current;
    if (!t) return;
    const d = camera.position.distanceTo(new THREE.Vector3(...node.position));
    const s = Math.max(0.35, Math.min(2.2, d / 105)) / Math.max(0.001, size);
    t.scale.setScalar(s);
  });

  return (
    <group position={node.position}>
      <mesh
        scale={selected || highlighted ? size * 1.25 : size}
        onClick={(e) => { e.stopPropagation(); selectNode(node); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(node.id); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(null); document.body.style.cursor = "auto"; }}
      >
        <sphereGeometry args={[1, 20, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={selected || highlighted ? color : "#000000"}
          emissiveIntensity={selected || highlighted ? 0.9 : 0}
          transparent
          opacity={dimmed ? 0.15 : 1}
        />
      </mesh>
      {/* WebGL text instead of drei <Html>: <Html> mutates the DOM that React
          owns, which caused removeChild crashes and let labels bleed over the
          side panels. Text renders inside the canvas, so it is cheaper and is
          always clipped to the scene. */}
      {label && (
        <Text
          ref={labelRef}
          position={[0, size + 0.5, 0]}
          fontSize={1}
          color={dimmed ? "#2b3a4d" : selected ? "#ffffff" : "#b6c4d4"}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.09}
          outlineColor="#05070f"
          maxWidth={13}
          onClick={(e) => { e.stopPropagation(); selectNode(node); }}
        >
          {node.name}
        </Text>
      )}
    </group>
  );
}

function World() {
  const { graph, hoveredNode, isolatedCluster, selectedNode } = useWorld();
  const controlsRef = useRef<any>(null);
  const nodes = useMemo(() => {
    if (!graph) return [];
    return isolatedCluster ? graph.nodes.filter(n => graph.clusters.find(c => c.id === isolatedCluster)?.nodeIds.includes(n.id)) : graph.nodes;
  }, [graph, isolatedCluster]);
  const visibleIds = useMemo(() => new Set(nodes.map(n => n.id)), [nodes]);

  const neighborSet = useMemo(() => {
    const s = new Set<string>();
    if (!graph || !hoveredNode && !selectedNode) return s;
    const focus = hoveredNode ?? selectedNode?.id;
    if (!focus) return s;
    s.add(focus);
    for (const e of graph.edges) {
      if (e.source === focus && visibleIds.has(e.target)) s.add(e.target);
      if (e.target === focus && visibleIds.has(e.source)) s.add(e.source);
    }
    return s;
  }, [graph, hoveredNode, selectedNode, visibleIds]);

  const edgesGeom = useMemo(() => {
    if (!graph) return null;
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    const byId = new Map(graph.nodes.map(n => [n.id, n]));
    let count = 0;
    for (const e of graph.edges) {
      if (e.weight < 0.55) continue; // filter weak edges for clarity
      const a = byId.get(e.source), b = byId.get(e.target);
      if (!a || !b || !visibleIds.has(a.id) || !visibleIds.has(b.id)) continue;
      pos.push(...a.position, ...b.position);
      c.set(TYPE_COLORS[a.type] ?? "#64748b").lerp(new THREE.Color("#0f172a"), 1 - e.weight * 0.7);
      const focus = hoveredNode ?? selectedNode?.id;
      const active = !focus || e.source === focus || e.target === focus;
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      void active;
      count++;
      if (count > 400) break;
    }
    if (!count) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  }, [graph, visibleIds, hoveredNode, selectedNode]);

  const topPerCluster = useMemo(() => {
    if (!graph) return new Set<string>();
    const s = new Set<string>();
    for (const c of graph.clusters) {
      const ns = graph.nodes.filter(n => n.cluster === c.label && visibleIds.has(n.id))
        .sort((a, b) => b.importance - a.importance).slice(0, 4);
      ns.forEach(n => s.add(n.id));
    }
    return s;
  }, [graph, visibleIds]);

  const { selectEdge } = useWorld();
  const edgeDots = useMemo(() => {
    if (!graph) return [];
    const byId = new Map(graph.nodes.map(n => [n.id, n]));
    return graph.edges
      .filter(e => e.confidence >= 0.6 && visibleIds.has(e.source) && visibleIds.has(e.target))
      .slice(0, 60)
      .map(e => {
        const a = byId.get(e.source)!, b = byId.get(e.target)!;
        return { e, mid: [(a.position[0] + b.position[0]) / 2, (a.position[1] + b.position[1]) / 2, (a.position[2] + b.position[2]) / 2] as [number, number, number] };
      });
  }, [graph, visibleIds]);

  if (!graph) return null;
  const focus = hoveredNode ?? selectedNode?.id;

  return (
    <>
      <ambientLight intensity={0.7} />
      <pointLight position={[60, 40, 60]} intensity={1.2} />
      <pointLight position={[-60, -30, -40]} intensity={0.5} color="#38bdf8" />
      <Stars radius={300} depth={80} count={2500} factor={4} fade speed={0.4} />
      {edgesGeom && (
        <lineSegments geometry={edgesGeom}>
          <lineBasicMaterial vertexColors transparent opacity={0.4} />
        </lineSegments>
      )}
      {edgeDots.map(({ e, mid }) => (
        <mesh key={e.id} position={mid} scale={0.28}
          onClick={(ev) => { ev.stopPropagation(); selectEdge(e); }}
          onPointerOver={(ev) => { ev.stopPropagation(); document.body.style.cursor = "pointer"; }}
          onPointerOut={() => { document.body.style.cursor = "auto"; }}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.85} />
        </mesh>
      ))}
      {nodes.map(n => (
        <NodeMesh key={n.id} node={n}
          dimmed={!!focus && !neighborSet.has(n.id)}
          highlighted={neighborSet.has(n.id) && n.id !== focus}
          label={topPerCluster.has(n.id) || n.id === focus || n.importance > 0.8}
        />
      ))}
      <CameraRig controlsRef={controlsRef} />
      <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.08} minDistance={6} maxDistance={220} />
    </>
  );
}

export default function WorldCanvas() {
  return (
    <div className="absolute inset-0">
      <Canvas dpr={[1, 1.75]} camera={{ position: [0, 26, 95], fov: 55 }} gl={{ antialias: true, alpha: true }}>
        <color attach="background" args={["#05070f"]} />
        <fog attach="fog" args={["#05070f", 120, 320]} />
        <World />
      </Canvas>
    </div>
  );
}
