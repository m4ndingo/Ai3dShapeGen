import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { ShapePart, FolderData } from '../lib/gemini';
import { AnimadorHolistico } from '../lib/AnimadorHolistico';

interface ThreeViewerProps {
  parts: ShapePart[];
  folders: FolderData[];
  selectedPartIndex: number | null;
  selectedFolderIndex: number | null;
  hiddenPartIndices: Set<number>;
  onSelectPart: (index: number | null) => void;
  onSelectFolder: (name: string | null) => void;
  onDoubleClickPart?: (index: number | null) => void;
  onUpdatePartTransform: (index: number, type: 'position' | 'scale' | 'rotation', values: [number, number, number]) => void;
  transformMode: 'translate' | 'rotate' | 'scale';
  activeSkills: Set<string>;
  sceneSettings: {
    backgroundColor: string;
    floorColor: string;
    lightIntensity: number;
    ambientIntensity: number;
    dramaticLighting: boolean;
    materialType: 'standard' | 'wireframe' | 'flat';
    showGrid: boolean;
    showFloor: boolean;
    castShadows: boolean;
  };
}

export interface ThreeViewerHandle {
  exportToGLB: () => void;
  takeScreenshot: () => string;
  setSkillState: (skillId: string, isActive: boolean) => void;
  getActiveSkills: () => string[];
  getAnimationDebugInfo: () => any;
  focusCamera: (mode?: 'fit' | 'portrait') => void;
}

const ThreeViewer = forwardRef<ThreeViewerHandle, ThreeViewerProps>(({ 
  parts, 
  folders,
  selectedPartIndex, 
  selectedFolderIndex,
  hiddenPartIndices, 
  onSelectPart, 
  onSelectFolder,
  onDoubleClickPart,
  onUpdatePartTransform, 
  transformMode, 
  activeSkills,
  sceneSettings 
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const directionalLightRef = useRef<THREE.DirectionalLight | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const floorRef = useRef<THREE.Mesh | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const onSelectPartRef = useRef(onSelectPart);
  const onSelectFolderRef = useRef(onSelectFolder);
  const onDoubleClickPartRef = useRef(onDoubleClickPart);
  const onUpdatePartTransformRef = useRef(onUpdatePartTransform);
  const selectedPartIndexRef = useRef(selectedPartIndex);
  const selectedFolderIndexRef = useRef(selectedFolderIndex);
  const transformModeRef = useRef(transformMode);
  const isDraggingRef = useRef(false);
  const wasDraggingRef = useRef(false);
  const pointerDownPos = useRef({ x: 0, y: 0 });
  const geometryCache = useRef<Map<string, THREE.BufferGeometry>>(new Map());
  const animatorRef = useRef<AnimadorHolistico | null>(null);
  const lastTimeRef = useRef(performance.now());
  const prevPartsLengthRef = useRef(0);

  useEffect(() => {
    onSelectPartRef.current = onSelectPart;
    onSelectFolderRef.current = onSelectFolder;
    onDoubleClickPartRef.current = onDoubleClickPart;
    onUpdatePartTransformRef.current = onUpdatePartTransform;
    selectedPartIndexRef.current = selectedPartIndex;
    selectedFolderIndexRef.current = selectedFolderIndex;
    transformModeRef.current = transformMode;
  }, [onSelectPart, onSelectFolder, onDoubleClickPart, onUpdatePartTransform, selectedPartIndex, selectedFolderIndex, transformMode]);

  useImperativeHandle(ref, () => ({
    exportToGLB: () => {
      if (!groupRef.current) return;
      
      const exporter = new GLTFExporter();
      exporter.parse(
        groupRef.current,
        (result) => {
          const output = result instanceof ArrayBuffer ? result : JSON.stringify(result);
          const blob = new Blob([output], { type: result instanceof ArrayBuffer ? 'application/octet-stream' : 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'object.glb';
          link.click();
          URL.revokeObjectURL(url);
        },
        (error) => {
          console.error('An error happened during export', error);
        },
        { binary: true }
      );
    },
    takeScreenshot: () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return '';
      
      // Render one frame to ensure we capture the current state
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      return rendererRef.current.domElement.toDataURL('image/png');
    },
    setSkillState: (skillId: string, isActive: boolean) => {
      animatorRef.current?.setSkillState(skillId, isActive);
    },
    getActiveSkills: () => {
      return animatorRef.current?.getActiveSkills() || [];
    },
    getAnimationDebugInfo: () => {
      return animatorRef.current?.getDebugInfo() || null;
    },
    focusCamera: (mode: 'fit' | 'portrait' = 'fit') => {
      if (!groupRef.current || !cameraRef.current || !orbitControlsRef.current) return;

      const box = new THREE.Box3().setFromObject(groupRef.current);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = cameraRef.current.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));

      if (mode === 'fit') {
        cameraZ *= 1.5;
        cameraRef.current.position.set(cameraZ, cameraZ * 0.8, cameraZ);
        orbitControlsRef.current.target.copy(center);
      } else {
        const headPos = center.clone().add(new THREE.Vector3(0, size.y * 0.25, 0));
        cameraZ = (size.y * 0.5) / Math.tan(fov / 2);
        cameraRef.current.position.set(cameraZ * 0.8, headPos.y, cameraZ * 0.8);
        orbitControlsRef.current.target.copy(headPos);
      }
      orbitControlsRef.current.update();
    }
  }));

  const createAxisLabel = (text: string, color: string, position: THREE.Vector3) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = color;
      ctx.font = 'Bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 32, 32);
    }
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.copy(position);
    sprite.scale.set(0.4, 0.4, 0.4);
    sprite.renderOrder = 999;
    return sprite;
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    try {
      scene.background = new THREE.Color(sceneSettings.backgroundColor);
    } catch (e) {
      scene.background = new THREE.Color('#f4f4f5');
    }
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000);
    camera.position.set(5, 5, 5);

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      preserveDrawingBuffer: true, // Required for screenshots
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    
    // Ensure container is empty before appending
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(renderer.domElement);
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    }
    
    rendererRef.current = renderer;
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    orbitControlsRef.current = controls;

    // Transform Controls
    const transformControls = new TransformControls(camera, renderer.domElement);
    console.log("TransformControls created:", transformControls);
    console.log("Is Object3D?", transformControls.isObject3D || transformControls instanceof THREE.Object3D);
    
    transformControls.setMode(transformMode);
    transformControls.enabled = true;
    (transformControls as any).visible = true;
    
    // Custom colors as requested: Red (X), Green (Y), Yellow (Z)
    // TransformControls axes are children of the helper
    const children = (transformControls as any).children;
    const gizmo = children && children.length > 0 ? children[0] : null;
    if (gizmo && gizmo.children) {
      gizmo.children.forEach((child: any) => {
        if (child.name === 'X') child.material.color.set(0xff0000);
        if (child.name === 'Y') child.material.color.set(0x00ff00);
        if (child.name === 'Z') child.material.color.set(0xffff00);
      });
    }

    const updateState = (force = false) => {
      if (!isDraggingRef.current && !force) return;
      if (transformControls.object) {
        const targetIndex = selectedFolderIndexRef.current !== null 
          ? (-1000 - selectedFolderIndexRef.current) 
          : selectedPartIndexRef.current;
        
        if (targetIndex === null) return;
        
        const obj = transformControls.object;
        if (transformModeRef.current === 'translate') {
          onUpdatePartTransformRef.current(targetIndex, 'position', [obj.position.x, obj.position.y, obj.position.z]);
        } else if (transformModeRef.current === 'rotate') {
          onUpdatePartTransformRef.current(targetIndex, 'rotation', [obj.rotation.x, obj.rotation.y, obj.rotation.z]);
        } else if (transformModeRef.current === 'scale') {
          onUpdatePartTransformRef.current(targetIndex, 'scale', [obj.scale.x, obj.scale.y, obj.scale.z]);
        }
      }
    };

    transformControls.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value;
      isDraggingRef.current = event.value;
      if (event.value) {
        wasDraggingRef.current = true;
      } else {
        // Drag finished, update state one last time
        updateState(true);
        // Delay resetting wasDragging to catch the click event that follows mouseup
        setTimeout(() => {
          wasDraggingRef.current = false;
        }, 200);
      }
    });

    transformControls.addEventListener('change', () => {
      // No throttling while dragging because we blocked scene rebuilds
      updateState();
    });

    // Raycasting for selection
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current || !groupRef.current || !cameraRef.current) return;
      wasDraggingRef.current = false;
      pointerDownPos.current = { x: event.clientX, y: event.clientY };
      
      const rect = containerRef.current.getBoundingClientRect();
      mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!containerRef.current || !groupRef.current || !cameraRef.current) return;
      
      // If we were dragging the gizmo, don't select
      if (wasDraggingRef.current) return;

      // Check if the pointer moved significantly (more than 5 pixels)
      const dist = Math.sqrt(
        Math.pow(event.clientX - pointerDownPos.current.x, 2) +
        Math.pow(event.clientY - pointerDownPos.current.y, 2)
      );
      if (dist > 5) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(mouse.current, cameraRef.current);

      // Check if we hit the gizmo first to avoid deselection when clicking axes
      if (transformControls.axis !== null) return;

      // Filter out non-mesh objects and gizmos from intersection
      const selectableObjects: THREE.Object3D[] = [];
      groupRef.current.traverse((child) => {
        // Only intersect meshes that are part of the model (have index or folder)
        if ((child as any).isMesh && child.userData && (typeof child.userData.index === 'number' || child.userData.folder)) {
          selectableObjects.push(child);
        }
      });

      const intersects = raycaster.current.intersectObjects(selectableObjects, false); // No recursion needed as we already have the meshes

      if (intersects && intersects.length > 0) {
        // Find the closest object that has userData.index or userData.folder
        let target = null;
        for (const intersect of intersects) {
          let obj = intersect.object;
          while (obj && obj !== groupRef.current) {
            if (typeof obj.userData.index === 'number' || obj.userData.folder) {
              target = obj;
              break;
            }
            obj = obj.parent as THREE.Object3D;
          }
          if (target) break;
        }

        if (target) {
          const index = target.userData.index;
          const folderName = target.userData.folder;
          
          if (folderName) {
            onSelectFolderRef.current(folderName);
          } else if (typeof index === 'number') {
            onSelectPartRef.current(index);
          }
        }
      } else {
        onSelectPartRef.current(null);
        onSelectFolderRef.current(null);
      }
    };

    const handleDoubleClick = (event: MouseEvent) => {
      if (!containerRef.current || !groupRef.current || !cameraRef.current) return;
      
      // If we are in AnimationStage (implied by double click on background or model)
      // and the user wants to toggle auto-rotate
      if (onDoubleClickPartRef.current) {
        // This is the original logic for selecting parts in the main viewer
        const rect = containerRef.current.getBoundingClientRect();
        mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.current.setFromCamera(mouse.current, cameraRef.current);
        const intersects = raycaster.current.intersectObjects(groupRef.current.children, true);

        if (intersects && intersects.length > 0) {
          let object = intersects[0].object;
          while (object.parent && !object.userData.index && object.userData.index !== 0) {
            object = object.parent;
          }
          const index = object.userData.index;
          if (typeof index === 'number') {
            onDoubleClickPartRef.current?.(index);
          }
        }
      }
    };

    renderer.domElement.addEventListener('dblclick', handleDoubleClick);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, sceneSettings.ambientIntensity);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const directionalLight = new THREE.DirectionalLight(0xffffff, sceneSettings.lightIntensity);
    directionalLight.position.set(10, 15, 10);
    directionalLight.castShadow = true;

    const dramaticLight = new THREE.DirectionalLight(0xffffff, sceneSettings.lightIntensity * 1.2);
    dramaticLight.position.set(15, 12, 8);
    dramaticLight.castShadow = true;
    dramaticLight.visible = sceneSettings.dramaticLighting;
    
    // High quality shadows for dramatic light
    dramaticLight.shadow.mapSize.width = 1024;
    dramaticLight.shadow.mapSize.height = 1024;
    
    scene.add(dramaticLight);
    (scene as any).dramaticLight = dramaticLight;
    
    // Configure shadow properties
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    
    scene.add(directionalLight);
    directionalLightRef.current = directionalLight;

    // Grid
    const gridHelper = new THREE.GridHelper(20, 20, 0xcccccc, 0xeeeeee);
    gridHelper.visible = sceneSettings.showGrid;
    scene.add(gridHelper);
    gridRef.current = gridHelper;

    // Floor
    const floorGeometry = new THREE.PlaneGeometry(100, 100);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
      color: sceneSettings.floorColor,
      roughness: 0.8,
      metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    floor.visible = sceneSettings.showFloor;
    scene.add(floor);
    floorRef.current = floor;

    // Shadow plane (to keep shadows transparent on top of colored floor)
    const shadowPlaneGeometry = new THREE.PlaneGeometry(100, 100);
    const shadowPlaneMaterial = new THREE.ShadowMaterial({ opacity: 0.2 });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeometry, shadowPlaneMaterial);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -0.005; // Slightly above the colored floor
    shadowPlane.receiveShadow = true;
    shadowPlane.visible = sceneSettings.showFloor && sceneSettings.castShadows;
    scene.add(shadowPlane);
    (scene as any).shadowPlane = shadowPlane;

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    // Add TransformControls at the end to avoid blocking if it fails
    try {
      if (transformControls) {
        const isValid = transformControls.isObject3D || transformControls instanceof THREE.Object3D;
        if (isValid) {
          scene.add(transformControls as any);
          console.log("TransformControls added to scene successfully");
        } else {
          console.error("TransformControls is NOT a valid Object3D", transformControls);
        }
      }
    } catch (e) {
      console.error("CRITICAL: Could not add TransformControls to scene:", e);
    }
    transformControlsRef.current = transformControls;

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('dblclick', handleDoubleClick);

    const animate = () => {
      const frameId = requestAnimationFrame(animate);
      (animate as any).frameId = frameId;
      
      const now = performance.now();
      const delta = Math.min((now - lastTimeRef.current) / 1000, 0.1); // Cap delta to avoid jumps
      lastTimeRef.current = now;

      if (animatorRef.current) {
        animatorRef.current.update(delta);
      }
      
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup cached geometries on unmount
    return () => {
      window.removeEventListener('resize', handleResize);
      if ((animate as any).frameId) cancelAnimationFrame((animate as any).frameId);
      geometryCache.current.forEach(geo => geo.dispose());
      geometryCache.current.clear();
      if (rendererRef.current) {
        rendererRef.current.domElement.removeEventListener('pointerdown', handlePointerDown);
        rendererRef.current.domElement.removeEventListener('pointerup', handlePointerUp);
        rendererRef.current.domElement.removeEventListener('dblclick', handleDoubleClick);
        rendererRef.current.dispose();
        if (containerRef.current && rendererRef.current.domElement.parentNode) {
          containerRef.current.removeChild(rendererRef.current.domElement);
        }
      }
    };
  }, []);

  // Update scene settings
  useEffect(() => {
    if (sceneRef.current) {
      try {
        sceneRef.current.background = new THREE.Color(sceneSettings.backgroundColor);
      } catch (e) {
        sceneRef.current.background = new THREE.Color('#f4f4f5');
      }
    }
    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = sceneSettings.ambientIntensity;
    }
    if (directionalLightRef.current) {
      directionalLightRef.current.intensity = sceneSettings.lightIntensity;
      directionalLightRef.current.castShadow = sceneSettings.castShadows;
    }
    if (gridRef.current) {
      gridRef.current.visible = sceneSettings.showGrid;
    }
    if (floorRef.current) {
      floorRef.current.visible = sceneSettings.showFloor;
      (floorRef.current.material as THREE.MeshStandardMaterial).color.set(sceneSettings.floorColor);
    }
    const shadowPlane = (sceneRef.current as any)?.shadowPlane as THREE.Mesh;
    if (shadowPlane) {
      shadowPlane.visible = sceneSettings.showFloor && sceneSettings.castShadows;
    }
    if (rendererRef.current) {
      rendererRef.current.shadowMap.enabled = sceneSettings.castShadows;
    }
    const dramaticLight = (sceneRef.current as any)?.dramaticLight as THREE.DirectionalLight;
    if (dramaticLight) {
      dramaticLight.visible = sceneSettings.dramaticLighting;
      dramaticLight.intensity = sceneSettings.lightIntensity * 1.2;
    }
    if (transformControlsRef.current) {
      transformControlsRef.current.setMode(transformMode);
    }
  }, [sceneSettings, transformMode]);

  useEffect(() => {
    if (!groupRef.current || isDraggingRef.current) return;

    // Clear existing parts
    if (groupRef.current) {
      while (groupRef.current.children.length > 0) {
        const child = groupRef.current.children[0];
        if (!child) break;
        // We don't dispose geometries here anymore as they are cached
        if (child instanceof THREE.Group) {
          child.children.forEach(mesh => {
            if (mesh instanceof THREE.Mesh) {
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach(m => m && m.dispose());
              } else if (mesh.material) {
                mesh.material.dispose();
              }
            }
          });
        }
        groupRef.current.remove(child);
      }
    }

    // Use cached geometries to avoid re-creating them
    const getGeometry = (type: string): THREE.BufferGeometry => {
      if (geometryCache.current.has(type)) return geometryCache.current.get(type)!;
      
      let geo: THREE.BufferGeometry;
      switch (type) {
        case 'box': geo = new THREE.BoxGeometry(1, 1, 1); break;
        case 'sphere': geo = new THREE.SphereGeometry(0.5, 24, 24); break;
        case 'cylinder': geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 24); break;
        case 'cone': geo = new THREE.ConeGeometry(0.5, 1, 24); break;
        case 'torus': geo = new THREE.TorusGeometry(0.35, 0.15, 12, 48); break;
        case 'capsule': 
          geo = new THREE.CapsuleGeometry(0.5, 0.5, 4, 12);
          geo.scale(1, 1/1.5, 1);
          break;
        default: geo = new THREE.BoxGeometry(1, 1, 1);
      }
      geometryCache.current.set(type, geo);
      return geo;
    };

    // Add new parts
    const containerMap = new Map<string, THREE.Group>();
    const folderGroups = new Map<string, THREE.Group>();
    const partsToProcess: { part: ShapePart, index: number }[] = [];

    // Create folder groups first
    folders.forEach((folder, fIndex) => {
      if (!folder.position || !folder.rotation || !folder.scale) return;
      
      const folderGroup = new THREE.Group();
      folderGroup.position.set(folder.position[0], folder.position[1], folder.position[2]);
      folderGroup.rotation.set(folder.rotation[0], folder.rotation[1], folder.rotation[2]);
      folderGroup.scale.set(folder.scale[0], folder.scale[1], folder.scale[2]);
      folderGroup.name = `folder_${folder.name}`;
      folderGroup.userData.folderIndex = fIndex;
      folderGroup.userData.folderName = folder.name;
      
      groupRef.current?.add(folderGroup);
      folderGroups.set(folder.name, folderGroup);
    });

    parts.forEach((part, index) => {
      if (hiddenPartIndices.has(index)) return;
      if (!part || !part.position || !part.scale || !part.rotation) return;

      const geometry = getGeometry(part.type);

      const isPartSelected = selectedPartIndex === index;
      const isFolderSelected = selectedFolderIndex !== null && folders[selectedFolderIndex]?.name === part.folder;
      const isSelected = isPartSelected || isFolderSelected;
      
      let material: THREE.Material;
      let safeColor = part.color;
      try {
        // Basic check if it's a valid color string or hex
        if (typeof safeColor !== 'string' || (!safeColor.startsWith('#') && !['red', 'green', 'blue', 'yellow', 'white', 'black', 'gray'].includes(safeColor.toLowerCase()))) {
           // If it looks like a vector string "x, y, z", it's definitely invalid
           if (safeColor.includes(',')) safeColor = '#cccccc';
        }
        new THREE.Color(safeColor);
      } catch (e) {
        safeColor = '#cccccc';
      }

      const baseOptions = {
        color: safeColor,
        transparent: true,
        opacity: 1,
        wireframe: sceneSettings.materialType === 'wireframe',
      };

      if (sceneSettings.materialType === 'flat') {
        material = new THREE.MeshBasicMaterial(baseOptions);
      } else {
        material = new THREE.MeshStandardMaterial({
          ...baseOptions,
          emissive: isSelected ? new THREE.Color(0x444444) : new THREE.Color(0x000000),
          emissiveIntensity: isSelected ? 1 : 0,
          roughness: 0.7,
          metalness: 0.2,
        });
      }
      
      // Create a container group for this part to act as a pivot
      // This prevents scale inheritance from parent to child
      const container = new THREE.Group();
      container.position.set(part.position[0], part.position[1], part.position[2]);
      container.rotation.set(part.rotation[0], part.rotation[1], part.rotation[2]);
      container.name = `pivot_${part.tag}`;

      const mesh = new THREE.Mesh(geometry, material);
      
      // Apply pivot offset if exists
      if (part.pivotOffset) {
        mesh.position.set(part.pivotOffset[0], part.pivotOffset[1], part.pivotOffset[2]);
      } else {
        mesh.position.set(0, 0, 0);
      }

      mesh.scale.set(part.scale[0], part.scale[1], part.scale[2]);
      mesh.userData.index = index;
      mesh.userData.folder = part.folder;
      mesh.castShadow = sceneSettings.castShadows;
      mesh.receiveShadow = sceneSettings.castShadows;
      mesh.name = part.tag;
      
      container.add(mesh);

      // Pivot indicator (only visible when selected)
      if (isSelected) {
        const pivotIndicator = new THREE.Mesh(
          new THREE.SphereGeometry(0.015, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.8 })
        );
        pivotIndicator.renderOrder = 999;
        container.add(pivotIndicator);
      }

      containerMap.set(part.tag, container);
      partsToProcess.push({ part, index });

      if (isSelected) {
        const edges = new THREE.EdgesGeometry(geometry);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x3b82f6, linewidth: 2 }));
        line.raycast = () => {}; // Disable raycasting for the wireframe
        // Selection highlight follows the mesh
        mesh.add(line);
      }
    });

    // Build hierarchy using the container/pivot groups
    partsToProcess.forEach(({ part }) => {
      const container = containerMap.get(part.tag);
      if (!container) return;

      if (part.parent && containerMap.has(part.parent)) {
        const parentContainer = containerMap.get(part.parent);
        parentContainer?.add(container);
      } else if (part.folder && folderGroups.has(part.folder)) {
        const folderGroup = folderGroups.get(part.folder);
        folderGroup?.add(container);
      } else {
        groupRef.current?.add(container);
      }
    });

    // Grounding logic: Ensure the model rests on the floor (y=0)
    if (groupRef.current && parts.length > 0) {
      // Reset position to calculate absolute bounding box
      groupRef.current.position.y = 0;
      const box = new THREE.Box3().setFromObject(groupRef.current);
      if (box.min.y !== Infinity) {
        // Shift the entire group up so the lowest point is exactly at y=0
        groupRef.current.position.y = -box.min.y;
      }
    }

    // Initialize or refresh animator
    if (groupRef.current) {
      if (!animatorRef.current) {
        animatorRef.current = new AnimadorHolistico(groupRef.current);
      } else {
        animatorRef.current.refresh();
      }
    }

    // Auto-focus on new model
    if (parts.length > 0 && prevPartsLengthRef.current === 0) {
      // Use a small timeout to ensure scene is fully updated
      setTimeout(() => {
        if (groupRef.current && cameraRef.current && orbitControlsRef.current) {
          const box = new THREE.Box3().setFromObject(groupRef.current);
          const size = box.getSize(new THREE.Vector3());
          if (size.length() > 0) {
            const center = box.getCenter(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = cameraRef.current.fov * (Math.PI / 180);
            const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 2.5;
            cameraRef.current.position.set(cameraZ, cameraZ * 0.8, cameraZ);
            orbitControlsRef.current.target.copy(center);
            orbitControlsRef.current.update();
          }
        }
      }, 100);
    }
    prevPartsLengthRef.current = parts.length;
  }, [parts, folders, hiddenPartIndices, sceneSettings.materialType, sceneSettings.castShadows, selectedPartIndex, selectedFolderIndex]);

  // Separate effect for animation synchronization to avoid rebuilding the scene
  useEffect(() => {
    if (animatorRef.current) {
      animatorRef.current.setSkillState('reposo', true);
      activeSkills.forEach(skillId => {
        animatorRef.current?.setSkillState(skillId, true);
      });
    }
  }, [activeSkills]);

    // Separate effect for gizmo mode
    useEffect(() => {
      if (transformControlsRef.current) {
        transformControlsRef.current.setMode(transformMode);
      }
    }, [transformMode]);

    // Separate effect for gizmo attachment to avoid rebuilding scene on selection change
    useEffect(() => {
      if (isDraggingRef.current) return;
      
      // Use requestAnimationFrame to ensure the scene rebuild effect has finished 
      // and objects are actually in the scene graph
      const frameId = requestAnimationFrame(() => {
        if (transformControlsRef.current && groupRef.current) {
          try {
            const tc = transformControlsRef.current as any;
            
            // Ensure TransformControls is in the scene and is a valid Object3D
            if (sceneRef.current && tc) {
              // Check if it's a valid Object3D using multiple methods to be safe
              const isValid = tc.isObject3D || (tc instanceof THREE.Object3D) || (tc.type === 'Group' || tc.type === 'Object3D');
              
              if (isValid) {
                if (!sceneRef.current.children.includes(tc)) {
                  try {
                    sceneRef.current.add(tc);
                  } catch (err) {
                    // Silent fail to avoid slowing down the app if it's a recurring error
                    if (Math.random() < 0.01) console.error("Failed to add tc to scene:", err);
                  }
                }
              } else {
                if (Math.random() < 0.01) console.error("tc is not valid Object3D", tc);
                return;
              }
            } else {
              return;
            }

            if (selectedFolderIndex !== null && folders[selectedFolderIndex]) {
              const folder = folders[selectedFolderIndex];
              const folderGroup = groupRef.current.getObjectByName(`folder_${folder.name}`);
              if (folderGroup) {
                // Check if folderGroup is actually in the scene graph
                let inScene = false;
                let current = folderGroup;
                while (current.parent) {
                  if (current.parent === sceneRef.current) {
                    inScene = true;
                    break;
                  }
                  current = current.parent;
                }

                if (inScene) {
                  tc.attach(folderGroup);
                } else {
                  tc.detach();
                }
              } else {
                tc.detach();
              }
            } else if (selectedPartIndex !== null && parts[selectedPartIndex]) {
              const part = parts[selectedPartIndex];
              const pivot = groupRef.current.getObjectByName(`pivot_${part.tag}`);
              if (pivot) {
                // Check if pivot is actually in the scene graph
                let inScene = false;
                let current = pivot;
                while (current.parent) {
                  if (current.parent === sceneRef.current) {
                    inScene = true;
                    break;
                  }
                  current = current.parent;
                }

                if (inScene) {
                  tc.attach(pivot);
                } else {
                  tc.detach();
                }
              } else {
                tc.detach();
              }
            } else {
              tc.detach();
            }
          } catch (e) {
            console.warn("TransformControls interaction error:", e);
            // If it fails, detach to be safe
            transformControlsRef.current?.detach();
          }
        }
      });

      return () => cancelAnimationFrame(frameId);
    }, [selectedPartIndex, selectedFolderIndex, parts, folders]);

  return <div ref={containerRef} className="w-full h-full overflow-hidden bg-white" />;
});

export default ThreeViewer;
