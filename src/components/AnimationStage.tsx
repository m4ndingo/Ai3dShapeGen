import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { motion, AnimatePresence } from 'motion/react';
import { X, Play, Pause, RotateCcw, Info, Box, Maximize2, Sun, Zap, Sparkles, Eye, Target, User } from 'lucide-react';
import { ShapePart, FolderData } from '../lib/gemini';
import { AnimadorHolistico } from '../lib/AnimadorHolistico';

interface SceneSettings {
  ambientIntensity: number;
  lightIntensity: number;
  rimIntensity: number;
  autoRotate: boolean;
  showGrid: boolean;
  bloomEffect: boolean;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
}

interface AnimationStageProps {
  isOpen: boolean;
  onClose: () => void;
  parts: ShapePart[];
  folders: FolderData[];
  activeSkills: Set<string>;
  onToggleSkill: (skillId: string) => void;
  settings: SceneSettings;
  onUpdateSettings: (settings: SceneSettings) => void;
}

const AnimationStage: React.FC<AnimationStageProps> = ({
  isOpen,
  onClose,
  parts,
  folders,
  activeSkills,
  onToggleSkill,
  settings,
  onUpdateSettings
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const animatorRef = useRef<AnimadorHolistico | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const lastTimeRef = useRef(performance.now());
  
  const [debugInfo, setDebugInfo] = useState<any>(null);

  // Light refs for dynamic updates
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const mainLightRef = useRef<THREE.DirectionalLight | null>(null);
  const rimLightRef = useRef<THREE.PointLight | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);

  const resetStage = () => {
    onUpdateSettings({
      ambientIntensity: 0.2,
      lightIntensity: 1.5,
      rimIntensity: 1.0,
      autoRotate: true,
      showGrid: true,
      bloomEffect: true,
      cameraPosition: [10, 8, 10],
      cameraTarget: [0, 0, 0]
    });
  };

  const focusCamera = (mode: 'fit' | 'portrait') => {
    if (!groupRef.current || !cameraRef.current || !controlsRef.current) return;

    const box = new THREE.Box3().setFromObject(groupRef.current);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = cameraRef.current.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));

    let newPos = new THREE.Vector3();
    let newTarget = new THREE.Vector3();

    if (mode === 'fit') {
      cameraZ *= 1.5;
      newPos.set(cameraZ, cameraZ * 0.8, cameraZ);
      newTarget.copy(center);
    } else {
      const headPos = center.clone().add(new THREE.Vector3(0, size.y * 0.25, 0));
      cameraZ = (size.y * 0.5) / Math.tan(fov / 2);
      newPos.set(cameraZ * 0.8, headPos.y, cameraZ * 0.8);
      newTarget.copy(headPos);
    }

    cameraRef.current.position.copy(newPos);
    controlsRef.current.target.copy(newTarget);
    controlsRef.current.update();

    onUpdateSettings({
      ...settings,
      cameraPosition: [newPos.x, newPos.y, newPos.z],
      cameraTarget: [newTarget.x, newTarget.y, newTarget.z]
    });
  };

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    // Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#020205');
    sceneRef.current = scene;

    // Add Starfield for spatial reference
    const starCount = 2000;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const r = 50 + Math.random() * 100;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);

      const brightness = 0.5 + Math.random() * 0.5;
      starColors[i * 3] = brightness;
      starColors[i * 3 + 1] = brightness;
      starColors[i * 3 + 2] = brightness * 1.2; // Slightly blueish
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMaterial = new THREE.PointsMaterial({ 
      size: 0.15, 
      vertexColors: true,
      transparent: true,
      opacity: 0.8
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    const camera = new THREE.PerspectiveCamera(45, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000);
    camera.position.set(settings.cameraPosition[0], settings.cameraPosition[1], settings.cameraPosition[2]);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = settings.autoRotate;
    controls.autoRotateSpeed = 0.5;
    controls.target.set(settings.cameraTarget[0], settings.cameraTarget[1], settings.cameraTarget[2]);
    controlsRef.current = controls;

    controls.addEventListener('change', () => {
      if (cameraRef.current && controlsRef.current) {
        const pos = cameraRef.current.position;
        const target = controlsRef.current.target;
        // We don't update settings on every change to avoid re-renders,
        // but we can do it on end or just before closing.
        // For now, let's update it when the user stops interacting.
      }
    });

    controls.addEventListener('end', () => {
      if (cameraRef.current && controlsRef.current) {
        onUpdateSettings({
          ...settings,
          cameraPosition: [cameraRef.current.position.x, cameraRef.current.position.y, cameraRef.current.position.z],
          cameraTarget: [controlsRef.current.target.x, controlsRef.current.target.y, controlsRef.current.target.z]
        });
      }
    });

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, settings.ambientIntensity);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const mainLight = new THREE.DirectionalLight(0xffffff, settings.lightIntensity);
    mainLight.position.set(10, 15, 10);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    scene.add(mainLight);
    mainLightRef.current = mainLight;

    const rimLight = new THREE.PointLight(0x3b82f6, settings.rimIntensity * 50);
    rimLight.position.set(-10, 5, -10);
    scene.add(rimLight);
    rimLightRef.current = rimLight;

    const fillLight = new THREE.DirectionalLight(0xffffff, settings.lightIntensity * 0.3);
    fillLight.position.set(-10, 5, 10);
    scene.add(fillLight);

    // Grid
    const grid = new THREE.GridHelper(20, 20, 0x3b82f6, 0x111111);
    grid.position.y = -0.01;
    grid.visible = settings.showGrid;
    scene.add(grid);
    gridRef.current = grid;

    // Floor / Stage
    const stageGeo = new THREE.CircleGeometry(12, 64);
    const stageMat = new THREE.MeshStandardMaterial({ 
      color: 0x080808, 
      roughness: 0.1, 
      metalness: 0.9,
      envMapIntensity: 1
    });
    const stage = new THREE.Mesh(stageGeo, stageMat);
    stage.rotation.x = -Math.PI / 2;
    stage.position.y = -0.02;
    stage.receiveShadow = true;
    scene.add(stage);

    // Build Model
    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    const containerMap = new Map<string, THREE.Group>();
    const folderGroups = new Map<string, THREE.Group>();

    folders.forEach(folder => {
      const fGroup = new THREE.Group();
      fGroup.position.set(folder.position[0], folder.position[1], folder.position[2]);
      fGroup.rotation.set(folder.rotation[0], folder.rotation[1], folder.rotation[2]);
      fGroup.scale.set(folder.scale[0], folder.scale[1], folder.scale[2]);
      fGroup.name = `folder_${folder.name}`;
      group.add(fGroup);
      folderGroups.set(folder.name, fGroup);
    });

    parts.forEach((part) => {
      let geo: THREE.BufferGeometry;
      switch (part.type) {
        case 'box': geo = new THREE.BoxGeometry(1, 1, 1); break;
        case 'sphere': geo = new THREE.SphereGeometry(0.5, 32, 32); break;
        case 'cylinder': geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); break;
        case 'cone': geo = new THREE.ConeGeometry(0.5, 1, 32); break;
        case 'torus': geo = new THREE.TorusGeometry(0.35, 0.15, 16, 64); break;
        case 'capsule': geo = new THREE.CapsuleGeometry(0.5, 0.5, 4, 16); break;
        default: geo = new THREE.BoxGeometry(1, 1, 1);
      }

      const mat = new THREE.MeshStandardMaterial({ 
        color: part.color,
        roughness: 0.4,
        metalness: 0.5,
        emissive: part.color,
        emissiveIntensity: settings.bloomEffect ? 0.05 : 0
      });

      const pivot = new THREE.Group();
      pivot.position.set(part.position[0], part.position[1], part.position[2]);
      pivot.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
      pivot.name = `pivot_${part.tag}`;

      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.set(part.scale[0], part.scale[1], part.scale[2]);
      mesh.name = part.tag;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      
      pivot.add(mesh);
      containerMap.set(part.tag, pivot);
    });

    parts.forEach(part => {
      const pivot = containerMap.get(part.tag);
      if (!pivot) return;
      if (part.parent && containerMap.has(part.parent)) {
        containerMap.get(part.parent)?.add(pivot);
      } else if (part.folder && folderGroups.has(part.folder)) {
        folderGroups.get(part.folder)?.add(pivot);
      } else {
        group.add(pivot);
      }
    });

    const box = new THREE.Box3().setFromObject(group);
    if (box.min.y !== Infinity) {
      group.position.y = -box.min.y;
    }

    const animator = new AnimadorHolistico(group);
    animatorRef.current = animator;

    // Apply active skills immediately
    animator.setSkillState('reposo', true);
    activeSkills.forEach(skill => animator.setSkillState(skill, true));

    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;
      if (animatorRef.current) animatorRef.current.update(delta);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    const handleDoubleClick = () => {
      onUpdateSettings({ ...settings, autoRotate: !settings.autoRotate });
    };
    containerRef.current.addEventListener('dblclick', handleDoubleClick);

    const debugInterval = setInterval(() => {
      if (animatorRef.current) setDebugInfo(animatorRef.current.getDebugInfo());
    }, 1000);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      if (containerRef.current) {
        containerRef.current.removeEventListener('dblclick', handleDoubleClick);
      }
      clearInterval(debugInterval);
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, [isOpen, parts, folders]);

  useEffect(() => {
    if (ambientLightRef.current) ambientLightRef.current.intensity = settings.ambientIntensity;
    if (mainLightRef.current) mainLightRef.current.intensity = settings.lightIntensity;
    if (rimLightRef.current) rimLightRef.current.intensity = settings.rimIntensity * 50;
    if (gridRef.current) gridRef.current.visible = settings.showGrid;
    if (controlsRef.current) controlsRef.current.autoRotate = settings.autoRotate;
    
    if (groupRef.current) {
      groupRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
          if (mat) mat.emissiveIntensity = settings.bloomEffect ? 0.1 : 0;
        }
      });
    }
  }, [settings]);

  useEffect(() => {
    if (animatorRef.current) {
      animatorRef.current.setSkillState('reposo', true);
      activeSkills.forEach(skill => animatorRef.current?.setSkillState(skill, true));
    }
  }, [activeSkills]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl p-0 sm:p-8">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative w-full max-w-7xl h-full bg-zinc-950 sm:rounded-[3rem] border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col lg:flex-row"
      >
        {/* 3D Viewport */}
        <div className="relative flex-1 min-h-[40vh] bg-black overflow-hidden">
          <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
          
          <div className="absolute top-6 left-6 sm:top-10 sm:left-10 space-y-1 pointer-events-none">
            <div className="flex items-center gap-2 text-blue-500">
              <Zap size={12} className="animate-pulse sm:w-4 sm:h-4" />
              <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em]">Neural Engine Activo</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tighter leading-none">Stage <span className="text-blue-600">Alpha</span></h2>
          </div>

          {/* Floating Controls Overlay (Right Column) */}
          <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex flex-col gap-2 z-50">
            {/* Close Button - Integrated into column */}
            <button 
              onClick={onClose}
              className="p-2 sm:p-2.5 bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-xl text-white/50 hover:text-red-500 hover:bg-red-500/20 hover:border-red-500/30 transition-all shadow-xl group relative"
              title="Cerrar"
            >
              <X size={16} />
              <span className="absolute right-full mr-3 px-2 py-1 bg-zinc-900 text-[10px] font-bold uppercase tracking-widest rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-white/5">Cerrar</span>
            </button>

            <div className="w-px h-4 bg-white/5 mx-auto my-1" />

            <button 
              onClick={() => focusCamera('fit')}
              className="p-2 sm:p-2.5 bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-xl text-white/70 hover:text-white hover:bg-blue-600/40 hover:border-blue-500/50 transition-all shadow-xl group relative"
              title="Encuadre General"
            >
              <Target size={16} />
              <span className="absolute right-full mr-3 px-2 py-1 bg-zinc-900 text-[10px] font-bold uppercase tracking-widest rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-white/5">Encuadre</span>
            </button>
            <button 
              onClick={() => focusCamera('portrait')}
              className="p-2 sm:p-2.5 bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-xl text-white/70 hover:text-white hover:bg-blue-600/40 hover:border-blue-500/50 transition-all shadow-xl group relative"
              title="Primer Plano"
            >
              <User size={16} />
              <span className="absolute right-full mr-3 px-2 py-1 bg-zinc-900 text-[10px] font-bold uppercase tracking-widest rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-white/5">Primer Plano</span>
            </button>
            <button 
              onClick={() => {
                if (controlsRef.current && cameraRef.current) {
                  const defaultPos = [10, 8, 10] as [number, number, number];
                  const defaultTarget = [0, 0, 0] as [number, number, number];
                  cameraRef.current.position.set(...defaultPos);
                  controlsRef.current.target.set(...defaultTarget);
                  controlsRef.current.update();
                  onUpdateSettings({
                    ...settings,
                    cameraPosition: defaultPos,
                    cameraTarget: defaultTarget
                  });
                }
              }}
              className="p-2 sm:p-2.5 bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-xl text-white/70 hover:text-white hover:bg-zinc-800 transition-all shadow-xl group relative"
              title="Reset Cámara"
            >
              <RotateCcw size={16} />
              <span className="absolute right-full mr-3 px-2 py-1 bg-zinc-900 text-[10px] font-bold uppercase tracking-widest rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-white/5">Reset Cam</span>
            </button>
          </div>

          <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 flex gap-4 pointer-events-none">
            <div className="px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-xl border border-white/5 flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${settings.autoRotate ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`} />
              <span className="text-[8px] font-bold text-white/50 uppercase tracking-widest">Sincronización Estable</span>
            </div>
          </div>
        </div>

        {/* Controls Sidebar */}
        <div className="w-full lg:w-[400px] bg-zinc-950 border-l border-white/5 p-6 sm:p-8 flex flex-col gap-6 sm:gap-8 overflow-y-auto custom-scrollbar">
          
          {/* Section: Skills */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-white font-black text-xs uppercase tracking-widest">Habilidades</h3>
                <p className="text-zinc-500 text-[10px]">Matrices de movimiento paramétrico</p>
              </div>
              <Sparkles size={16} className="text-blue-500" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'caminar', name: 'Caminar', desc: 'Locomoción' },
                { id: 'brazos', name: 'Brazos', desc: 'Lateral' },
                { id: 'colgados', name: 'Colgados', desc: 'Péndulo' },
                { id: 'vuelo', name: 'Vuelo', desc: 'Propulsión' },
                { id: 'analisis', name: 'Análisis', desc: 'Escrutinio' },
                { id: 'parpadeo', name: 'Parpadeo', desc: 'Ocular' },
                { id: 'boca', name: 'Boca', desc: 'Vocal' },
                { id: 'suspension', name: 'Suspensión', desc: 'Chasis' },
                { id: 'faros', name: 'Faros', desc: 'Luz' },
                { id: 'volante', name: 'Volante', desc: 'Dirección' },
              ].map((skill) => (
                <button
                  key={skill.id}
                  onClick={() => onToggleSkill(skill.id)}
                  className={`p-3 sm:p-4 rounded-2xl border text-left transition-all group relative overflow-hidden ${
                    activeSkills.has(skill.id)
                      ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)]'
                      : 'bg-white/5 border-white/5 text-zinc-500 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <div className="relative z-10">
                    <div className="font-black text-[9px] sm:text-[10px] uppercase tracking-wider">{skill.name}</div>
                    <div className={`text-[8px] mt-1 opacity-60 font-medium ${activeSkills.has(skill.id) ? 'text-blue-100' : 'text-zinc-600'}`}>
                      {skill.desc}
                    </div>
                  </div>
                  {activeSkills.has(skill.id) && (
                    <motion.div layoutId="active-bg" className="absolute inset-0 bg-gradient-to-br from-blue-500 to-blue-700" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Section: Scene Controls */}
          <div className="space-y-6 pt-6 border-t border-white/5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-white font-black text-xs uppercase tracking-widest">Entorno</h3>
                <p className="text-zinc-500 text-[10px]">Ajustes de iluminación y atmósfera</p>
              </div>
              <div className="flex gap-2">
                <button onClick={resetStage} className="p-1.5 text-zinc-500 hover:text-white transition-colors" title="Reset Escenario">
                  <RotateCcw size={14} />
                </button>
                <Sun size={16} className="text-amber-500" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider">
                  <span className="text-zinc-500">Luz Ambiental</span>
                  <span className="text-white">{(settings.ambientIntensity * 100).toFixed(0)}%</span>
                </div>
                <input 
                  type="range" min="0" max="2" step="0.1"
                  value={settings.ambientIntensity}
                  onChange={(e) => onUpdateSettings({ ...settings, ambientIntensity: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider">
                  <span className="text-zinc-500">Foco Principal</span>
                  <span className="text-white">{(settings.lightIntensity * 100).toFixed(0)}%</span>
                </div>
                <input 
                  type="range" min="0" max="4" step="0.1"
                  value={settings.lightIntensity}
                  onChange={(e) => onUpdateSettings({ ...settings, lightIntensity: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => onUpdateSettings({ ...settings, autoRotate: !settings.autoRotate })}
                  className={`p-3 rounded-xl border text-[9px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                    settings.autoRotate ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-white/5 text-zinc-600'
                  }`}
                >
                  <RotateCcw size={12} className={settings.autoRotate ? 'animate-spin-slow' : ''} />
                  Giro Auto
                </button>
                <button 
                  onClick={() => onUpdateSettings({ ...settings, showGrid: !settings.showGrid })}
                  className={`p-3 rounded-xl border text-[9px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                    settings.showGrid ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-white/5 text-zinc-600'
                  }`}
                >
                  <Box size={12} />
                  Rejilla
                </button>
              </div>
            </div>
          </div>

          {/* Section: Diagnostics */}
          <div className="mt-auto pt-6 border-t border-white/5 space-y-4">
            <div className="flex items-center gap-2 text-zinc-600">
              <Info size={14} />
              <span className="text-[9px] font-black uppercase tracking-[0.2em]">Diagnóstico de Red</span>
            </div>

            {debugInfo ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                    <div className="text-[8px] text-zinc-600 font-bold uppercase">Nodos</div>
                    <div className="text-xl font-black text-white">{debugInfo.nodeCount}</div>
                  </div>
                  <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
                    <div className="text-[8px] text-zinc-600 font-bold uppercase">Skills</div>
                    <div className="text-xl font-black text-white">{debugInfo.activeSkills.length}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[9px] font-bold text-zinc-700 uppercase tracking-wider">Mapeo Semántico</span>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {Object.entries(debugInfo.skillTargets).map(([skill, targets]: [string, any]) => (
                      <div key={skill} className="text-[10px] p-2 bg-black/40 rounded-xl border border-white/5">
                        <div className={`font-black uppercase text-[8px] mb-1 ${activeSkills.has(skill) ? 'text-blue-400' : 'text-zinc-600'}`}>
                          {skill}
                        </div>
                        {targets.length > 0 ? (
                          <div className="space-y-0.5">
                            {targets.map((t: string, i: number) => (
                              <div key={i} className="text-zinc-400 flex items-center gap-1.5">
                                <div className="w-1 h-1 bg-green-500 rounded-full" />
                                {t}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-zinc-800 italic text-[9px]">Sin nodos compatibles</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-zinc-800 text-[10px] font-bold uppercase tracking-widest animate-pulse">
                Sincronizando...
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AnimationStage;
