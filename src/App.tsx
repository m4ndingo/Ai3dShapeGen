import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { Sparkles, Download, Send, Loader2, Box, Info, History, Trash2, Save, Eye, EyeOff, Layers, Settings2, ChevronRight, ChevronDown, ChevronLeft, X, Plus, Copy, RotateCcw, Play, Maximize2, Search, Target, FolderPlus, Type } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ThreeViewer, { ThreeViewerHandle } from './components/ThreeViewer';
import AnimationStage from './components/AnimationStage';
import { generate3DObject, ShapePart, FolderData } from './lib/gemini';

interface SavedModel {
  id: string;
  name: string;
  prompt: string;
  thumbnail?: string;
  parts: ShapePart[];
  originalParts?: ShapePart[];
  suggestions: any[];
  suggestion?: string; // For backward compatibility
  timestamp: number;
}

interface SceneSettings {
  backgroundColor: string;
  floorColor: string;
  lightIntensity: number;
  ambientIntensity: number;
  dramaticLighting: boolean;
  materialType: 'standard' | 'wireframe' | 'flat';
  showGrid: boolean;
  showFloor: boolean;
  castShadows: boolean;
}

interface PartNode {
  index: number;
  part: ShapePart;
  children: PartNode[];
}

const NumberInput = ({ value, onChange, className }: { 
  value: number; 
  onChange: (val: number) => void; 
  className?: string;
}) => {
  const [localValue, setLocalValue] = useState(value.toString());
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) {
      // Use a reasonable precision for display
      const formatted = Number.isInteger(value) ? value.toString() : parseFloat(value.toFixed(4)).toString();
      setLocalValue(formatted);
    }
  }, [value]);

  return (
    <input
      type="text"
      value={localValue}
      onFocus={() => { isFocused.current = true; }}
      onBlur={() => { 
        isFocused.current = false; 
        const formatted = Number.isInteger(value) ? value.toString() : parseFloat(value.toFixed(4)).toString();
        setLocalValue(formatted); 
      }}
      onChange={(e) => {
        const val = e.target.value;
        // Allow intermediate states for typing (empty, minus, decimal separators)
        if (val === '' || val === '-' || val === '.' || val === ',' || val === '-.' || val === '-,') {
          setLocalValue(val);
          return;
        }
        
        // Support both dot and comma as decimal separators
        const normalized = val.replace(',', '.');
        if (/^-?\d*[.,]?\d*$/.test(normalized)) {
          setLocalValue(val);
          const parsed = parseFloat(normalized);
          if (!isNaN(parsed)) {
            onChange(parsed);
          }
        }
      }}
      className={className}
    />
  );
};

class ErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-zinc-200 p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <Info size={32} />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-zinc-900">Algo salió mal</h2>
              <p className="text-sm text-zinc-500">La aplicación ha encontrado un error inesperado al renderizar el visor 3D.</p>
            </div>
            <div className="p-4 bg-zinc-50 rounded-xl text-left overflow-auto max-h-40">
              <code className="text-[10px] text-red-500 font-mono break-all">
                {this.state.error?.message || "Error desconocido"}
              </code>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-colors shadow-lg"
            >
              Recargar Aplicación
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [currentModelPrompt, setCurrentModelPrompt] = useState('');
  const [galleryPage, setGalleryPage] = useState(1);
  const itemsPerPage = 6;
  const [isLoading, setIsLoading] = useState(false);
  const [parts, setParts] = useState<ShapePart[]>([]);
  const [originalParts, setOriginalParts] = useState<ShapePart[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-3.1-flash-lite-preview');
  const [pendingAction, setPendingAction] = useState<{ prompt: string; isCustom: boolean } | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [lastGenerationTime, setLastGenerationTime] = useState<number | null>(null);
  const [savedModels, setSavedModels] = useState<SavedModel[]>([]);
  const [selectedPartIndex, setSelectedPartIndex] = useState<number | null>(null);
  const [selectedFolderIndex, setSelectedFolderIndex] = useState<number | null>(null);
  const [hiddenPartIndices, setHiddenPartIndices] = useState<Set<number>>(new Set());
  const [hiddenFolders, setHiddenFolders] = useState<Set<string>>(new Set());
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [activePanel, setActivePanel] = useState<'hierarchy' | 'properties' | 'scene' | 'animations' | null>(null);
  const [activeSkills, setActiveSkills] = useState<Set<string>>(new Set());
  const [animationDebug, setAnimationDebug] = useState<any>(null);
  const [isAnimationStageOpen, setIsAnimationStageOpen] = useState(false);
  const [animationStageSettings, setAnimationStageSettings] = useState({
    ambientIntensity: 0.2,
    lightIntensity: 1.5,
    rimIntensity: 1.0,
    autoRotate: true,
    showGrid: true,
    bloomEffect: true,
    cameraPosition: [10, 8, 10] as [number, number, number],
    cameraTarget: [0, 0, 0] as [number, number, number]
  });
  const [isUniformScale, setIsUniformScale] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const [hierarchySearch, setHierarchySearch] = useState('');
  const [history, setHistory] = useState<ShapePart[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [sceneSettings, setSceneSettings] = useState<SceneSettings>({
    backgroundColor: '#f8f9fa',
    floorColor: '#ffffff',
    lightIntensity: 1.0,
    ambientIntensity: 0.2,
    dramaticLighting: true,
    materialType: 'standard',
    showGrid: true,
    showFloor: true,
    castShadows: true,
  });
  const debugRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const generatorRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ThreeViewerHandle>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const toggleSkill = (skillId: string) => {
    const newSkills = new Set(activeSkills);
    if (newSkills.has(skillId)) {
      newSkills.delete(skillId);
    } else {
      newSkills.add(skillId);
    }
    setActiveSkills(newSkills);
  };

  const stopAllAnimations = () => {
    setActiveSkills(new Set());
  };

  // Animation Debug Polling
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activePanel === 'animations') {
      interval = setInterval(() => {
        if (viewerRef.current) {
          setAnimationDebug(viewerRef.current.getAnimationDebugInfo());
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activePanel]);

  // History Management
  const addToHistory = (newParts: ShapePart[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newParts)));
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const prevParts = history[prevIndex];
      setParts(JSON.parse(JSON.stringify(prevParts)));
      setHistoryIndex(prevIndex);
      addLog("⏪ Deshacer");
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const nextParts = history[nextIndex];
      setParts(JSON.parse(JSON.stringify(nextParts)));
      setHistoryIndex(nextIndex);
      addLog("⏩ Rehacer");
    }
  };

  // Build hierarchy tree - Memoized for performance
  const hierarchy = React.useMemo(() => {
    const map = new Map<string, PartNode>();
    
    // 1. Create nodes for explicit folders
    folders.forEach((folder, fIndex) => {
      map.set(folder.name, {
        index: -1000 - fIndex, // Special index for folders
        part: { 
          tag: folder.name, 
          type: 'box', 
          color: '#cccccc', 
          position: folder.position, 
          scale: folder.scale, 
          rotation: folder.rotation 
        } as any,
        children: []
      });
    });

    // 2. Create nodes for all parts
    parts.forEach((part, index) => {
      map.set(part.tag, { index, part, children: [] });
    });
    
    // 3. Link children to parents
    const rootNodes: PartNode[] = [];
    map.forEach(node => {
      const part = node.part;
      let uiParentTag: string | undefined;

      if (part.folder) {
        // If it has a folder, check if its 3D parent is in the same folder
        const parentPart = part.parent ? parts.find(p => p.tag === part.parent) : null;
        if (parentPart && parentPart.folder === part.folder) {
          // Same folder, respect 3D hierarchy for nesting
          uiParentTag = part.parent;
        } else {
          // Different folder or no parent, put in folder root to keep improvement separate
          uiParentTag = part.folder;
        }
      } else {
        // No folder, just use 3D parent
        uiParentTag = part.parent;
      }

      if (uiParentTag && map.has(uiParentTag)) {
        const parentNode = map.get(uiParentTag)!;
        parentNode.children.push(node);
      } else {
        rootNodes.push(node);
      }
    });

    // 4. Recursive function to filter out empty folders and apply search
    const filterAndSearch = (nodes: PartNode[]): PartNode[] => {
      const searchLower = hierarchySearch.toLowerCase().trim();
      return nodes.reduce((acc, node) => {
        const isFolder = node.index <= -1000;
        const matchesSearch = !searchLower || node.part.tag.toLowerCase().includes(searchLower);
        
        // Filter children first
        const filteredChildren = filterAndSearch(node.children);
        
        if (isFolder) {
          // Keep folder if it matches search OR has children that match
          if (matchesSearch || filteredChildren.length > 0) {
            acc.push({ ...node, children: filteredChildren });
          }
        } else {
          // Keep part if it matches search OR has children that match
          if (matchesSearch || filteredChildren.length > 0) {
            acc.push({ ...node, children: filteredChildren });
          }
        }
        return acc;
      }, [] as PartNode[]);
    };

    return filterAndSearch(rootNodes);
  }, [parts, folders, hierarchySearch]);

  const effectiveHiddenIndices = React.useMemo(() => {
    const effectiveHidden = new Set<number>();
    const memo = new Map<string, boolean>();

    const isTagHidden = (tag: string): boolean => {
      if (memo.has(tag)) return memo.get(tag)!;

      // Check if explicitly hidden as folder or part
      let hidden = hiddenFolders.has(tag);
      if (!hidden) {
        const pIdx = parts.findIndex(p => p.tag === tag);
        if (pIdx !== -1 && hiddenPartIndices.has(pIdx)) {
          hidden = true;
        }
      }

      // If not hidden itself, check parent/folder recursively
      if (!hidden) {
        const part = parts.find(p => p.tag === tag);
        if (part) {
          if (part.folder) {
            // If in a folder, visibility depends ONLY on the folder (and itself)
            hidden = isTagHidden(part.folder);
          } else if (part.parent) {
            // If NOT in a folder, visibility depends on the 3D parent
            hidden = isTagHidden(part.parent);
          }
        }
      }

      memo.set(tag, hidden);
      return hidden;
    };

    parts.forEach((part, index) => {
      if (isTagHidden(part.tag)) {
        effectiveHidden.add(index);
      }
    });
    
    return effectiveHidden;
  }, [parts, folders, hiddenFolders, hiddenPartIndices]);

  const onSelectFolderByName = React.useCallback((name: string | null) => {
    setEditingNodeId(null);
    if (name === null) {
      setSelectedFolderIndex(null);
      setSelectedPartIndex(null);
      setActivePanel(null);
      return;
    }
    const fIndex = folders.findIndex(f => f.name === name);
    if (fIndex !== -1) {
      setSelectedFolderIndex(fIndex);
      setSelectedPartIndex(null);
      // Auto-expand the folder when selected
      setExpandedNodes(prev => new Set(prev).add(name));
    }
  }, [folders]);

  const onSelectPart = React.useCallback((index: number | null) => {
    setEditingNodeId(null);
    setSelectedPartIndex(index);
    if (index !== null) {
      setSelectedFolderIndex(null);
      // Auto-expand all ancestors
      setParts(currentParts => {
        const part = currentParts[index];
        if (part) {
          const ancestors = new Set<string>();
          let currentParent = part.parent || part.folder;
          while (currentParent) {
            ancestors.add(currentParent);
            const parentPart = currentParts.find(p => p.tag === currentParent);
            currentParent = parentPart?.parent || parentPart?.folder;
          }
          setExpandedNodes(prev => {
            const next = new Set(prev);
            ancestors.forEach(a => next.add(a));
            return next;
          });
        }
        return currentParts;
      });
    } else {
      setSelectedFolderIndex(null);
      setActivePanel(null);
    }
  }, []);

  const onDoubleClickPart = React.useCallback((index: number | null) => {
    if (index !== null) {
      onSelectPart(index);
      setActivePanel('hierarchy');
    }
  }, [onSelectPart]);

  const toggleNode = (tag: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(tag)) {
      newExpanded.delete(tag);
    } else {
      newExpanded.add(tag);
    }
    setExpandedNodes(newExpanded);
  };

  const toggleFolderVisibility = (tag: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newHidden = new Set(hiddenFolders);
    if (newHidden.has(tag)) {
      newHidden.delete(tag);
    } else {
      newHidden.add(tag);
    }
    setHiddenFolders(newHidden);
  };

  const addFolder = () => {
    const name = window.prompt("Nombre de la carpeta:");
    if (name && !folders.some(f => f.name === name) && !parts.some(p => p.tag === name)) {
      setFolders([...folders, {
        name,
        position: [0, 0, 0],
        scale: [1, 1, 1],
        rotation: [0, 0, 0],
        visible: true
      }]);
      setExpandedNodes(prev => new Set(prev).add(name));
    }
  };

  const renameNode = (index: number, isFolder: boolean) => {
    const currentName = isFolder ? folders[index].name : parts[index].tag;
    setTempName(currentName);
    setEditingNodeId(isFolder ? `folder_${currentName}` : `part_${index}`);
  };

  const saveRename = (index: number, isFolder: boolean) => {
    const currentName = isFolder ? folders[index].name : parts[index].tag;
    const newName = tempName.trim();
    setEditingNodeId(null);
    
    if (!newName || newName === currentName) return;

    if (isFolder) {
      // Check if name exists
      if (folders.some(f => f.name === newName) || parts.some(p => p.tag === newName)) {
        alert("El nombre ya existe");
        return;
      }
      // Update folder name and all parts that reference it
      const oldName = folders[index].name;
      setFolders(prev => {
        const next = [...prev];
        next[index] = { ...next[index], name: newName };
        return next;
      });
      setParts(prev => prev.map(p => p.folder === oldName ? { ...p, folder: newName } : p));
      setExpandedNodes(prev => {
        const next = new Set(prev);
        if (next.has(oldName)) {
          next.delete(oldName);
          next.add(newName);
        }
        return next;
      });
    } else {
      // Check if name exists
      if (parts.some(p => p.tag === newName) || folders.some(f => f.name === newName)) {
        alert("El nombre ya existe");
        return;
      }
      const oldTag = parts[index].tag;
      setParts(prev => prev.map((p, i) => {
        if (i === index) return { ...p, tag: newName };
        if (p.parent === oldTag) return { ...p, parent: newName };
        return p;
      }));
    }
  };

  const updatePartFolder = (index: number, folderName: string | undefined) => {
    const newParts = [...parts];
    newParts[index] = { ...newParts[index], folder: folderName === "" ? undefined : folderName };
    setParts(newParts);
  };

  const updatePartParent = (index: number, parentTag: string | undefined) => {
    const newParts = [...parts];
    newParts[index] = { ...newParts[index], parent: parentTag === "" ? undefined : parentTag };
    setParts(newParts);
  };

  const updatePartColor = (index: number, color: string) => {
    const newParts = [...parts];
    newParts[index] = { ...newParts[index], color };
    setParts(newParts);
    addToHistory(newParts);
  };

  const updatePartTransform = React.useCallback((index: number, type: 'position' | 'scale' | 'rotation' | 'pivotOffset', value: number | [number, number, number], axis?: number) => {
    if (index <= -1000) {
      const fIndex = Math.abs(index + 1000);
      setFolders(prev => {
        if (fIndex >= prev.length) return prev;
        const next = [...prev];
        if (Array.isArray(value)) {
          next[fIndex] = { ...next[fIndex], [type]: value };
        } else if (axis !== undefined) {
          const currentVal = next[fIndex][type] || (type === 'scale' ? [1, 1, 1] : [0, 0, 0]);
          const newValues = [...currentVal] as [number, number, number];
          
          if (type === 'scale' && isUniformScale) {
            newValues[0] = value;
            newValues[1] = value;
            newValues[2] = value;
          } else {
            newValues[axis] = value;
          }
          
          next[fIndex] = { ...next[fIndex], [type]: newValues };
        }
        return next;
      });
      return;
    }
    setParts(prev => {
      if (index < 0 || index >= prev.length) return prev;
      const next = [...prev];
      if (Array.isArray(value)) {
        next[index] = { ...next[index], [type]: value };
      } else if (axis !== undefined) {
        const currentVal = next[index][type] || (type === 'scale' ? [1, 1, 1] : [0, 0, 0]);
        const newValues = [...currentVal] as [number, number, number];
        
        if (type === 'scale' && isUniformScale) {
          newValues[0] = value;
          newValues[1] = value;
          newValues[2] = value;
        } else {
          newValues[axis] = value;
        }
        
        next[index] = { ...next[index], [type]: newValues };
      }
      addToHistory(next);
      return next;
    });
  }, [history, historyIndex, isUniformScale]);

  const resetPartTransform = (index: number, type?: 'position' | 'scale' | 'rotation' | 'pivotOffset') => {
    if (index <= -1000) {
      const fIndex = Math.abs(index + 1000);
      setFolders(prev => {
        if (fIndex >= prev.length) return prev;
        const next = [...prev];
        // For folders, we don't have original state easily, so we reset to defaults
        if (type === 'position') next[fIndex] = { ...next[fIndex], position: [0, 0, 0] };
        else if (type === 'scale') next[fIndex] = { ...next[fIndex], scale: [1, 1, 1] };
        else if (type === 'rotation') next[fIndex] = { ...next[fIndex], rotation: [0, 0, 0] };
        else {
          next[fIndex] = { ...next[fIndex], position: [0, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0] };
        }
        return next;
      });
      return;
    }
    if (index < 0 || index >= originalParts.length) return;
    const newParts = [...parts];
    const original = originalParts[index];
    
    if (type) {
      // Ensure we have a valid array to copy from
      const originalValue = original[type] || (type === 'scale' ? [1, 1, 1] : [0, 0, 0]);
      newParts[index] = { ...newParts[index], [type]: [...originalValue] };
    } else {
      newParts[index] = { 
        ...newParts[index], 
        position: [...(original.position || [0, 0, 0])],
        scale: [...(original.scale || [1, 1, 1])],
        rotation: [...(original.rotation || [0, 0, 0])],
        pivotOffset: original.pivotOffset ? [...original.pivotOffset] : undefined
      };
    }
    setParts(newParts);
  };

  const getEffectiveHiddenIndices = () => {
    const effectiveHidden = new Set<number>();
    const memo = new Map<string, boolean>();

    const isTagHidden = (tag: string): boolean => {
      if (memo.has(tag)) return memo.get(tag)!;

      // Check if explicitly hidden as folder or part
      let hidden = hiddenFolders.has(tag);
      if (!hidden) {
        const pIdx = parts.findIndex(p => p.tag === tag);
        if (pIdx !== -1 && hiddenPartIndices.has(pIdx)) {
          hidden = true;
        }
      }

      // If not hidden itself, check parent/folder recursively
      if (!hidden) {
        const part = parts.find(p => p.tag === tag);
        if (part) {
          if (part.folder) {
            // If in a folder, visibility depends ONLY on the folder (and itself)
            hidden = isTagHidden(part.folder);
          } else if (part.parent) {
            // If NOT in a folder, visibility depends on the 3D parent
            hidden = isTagHidden(part.parent);
          }
        }
      }

      memo.set(tag, hidden);
      return hidden;
    };

    parts.forEach((part, index) => {
      if (isTagHidden(part.tag)) {
        effectiveHidden.add(index);
      }
    });
    
    return effectiveHidden;
  };

  const isTagEffectivelyHidden = (tag: string): boolean => {
    const memo = new Map<string, boolean>();
    const check = (t: string): boolean => {
      if (memo.has(t)) return memo.get(t)!;
      let hidden = hiddenFolders.has(t);
      if (!hidden) {
        const pIdx = parts.findIndex(p => p.tag === t);
        if (pIdx !== -1 && hiddenPartIndices.has(pIdx)) hidden = true;
      }
      if (!hidden) {
        const part = parts.find(p => p.tag === t);
        if (part) {
          if (part.folder) {
            // If in a folder, visibility depends ONLY on the folder (and itself)
            hidden = check(part.folder);
          } else if (part.parent) {
            // If NOT in a folder, visibility depends on the 3D parent
            hidden = check(part.parent);
          }
        }
      }
      memo.set(t, hidden);
      return hidden;
    };
    return check(tag);
  };

  const renderHierarchyNode = (node: PartNode, depth: number = 0) => {
    const isExpanded = expandedNodes.has(node.part.tag);
    const hasChildren = node.children.length > 0;
    const isFolder = node.index <= -1;
    const isSelected = isFolder 
      ? (selectedFolderIndex !== null && folders[selectedFolderIndex]?.name === node.part.tag)
      : (selectedPartIndex === node.index);
    const isEffectivelyHidden = isTagEffectivelyHidden(node.part.tag);
    const isLocallyHidden = isFolder ? hiddenFolders.has(node.part.tag) : hiddenPartIndices.has(node.index);

    const handleSelect = () => {
      if (isFolder) {
        onSelectFolderByName(node.part.tag);
      } else {
        onSelectPart(node.index);
      }
    };

    const handleDoubleClick = () => {
      handleSelect();
      setActivePanel('properties');
    };

    return (
      <div key={node.part.tag + node.index} className="space-y-1">
        <div
          onClick={handleSelect}
          onDoubleClick={handleDoubleClick}
          className={`group flex items-center justify-between p-1.5 rounded-md cursor-pointer transition-all ${isSelected ? 'bg-blue-50 border border-blue-100' : 'hover:bg-zinc-50 border border-transparent'}`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren ? (
              <button 
                onClick={(e) => toggleNode(node.part.tag, e)}
                className="p-0.5 hover:bg-zinc-200 rounded transition-colors"
              >
                {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              </button>
            ) : (
              <div className="w-4" />
            )}
            {isFolder ? (
              <Layers size={12} className="text-amber-500 shrink-0" />
            ) : (
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: node.part.color }} />
            )}
            {editingNodeId === (isFolder ? `folder_${node.part.tag}` : `part_${node.index}`) ? (
              <div className="flex items-center gap-1 flex-1">
                <input 
                  autoFocus
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveRename(isFolder ? folders.findIndex(f => f.name === node.part.tag) : node.index, isFolder);
                    if (e.key === 'Escape') setEditingNodeId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[10px] font-bold text-zinc-800 bg-white border border-blue-500/30 rounded px-1 py-0.5 outline-none w-full"
                />
              </div>
            ) : (
              <span 
                className={`text-[10px] truncate font-medium ${isSelected ? 'text-blue-700' : isFolder ? 'text-zinc-800' : 'text-zinc-600'} ${isEffectivelyHidden && !isLocallyHidden ? 'opacity-50 italic' : ''}`}
                onClick={(e) => {
                  if (isSelected) {
                    e.stopPropagation();
                    renameNode(isFolder ? folders.findIndex(f => f.name === node.part.tag) : node.index, isFolder);
                  }
                }}
              >
                {(node.part.tag || '').replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => isFolder ? toggleFolderVisibility(node.part.tag, e) : toggleVisibility(node.index, e)}
              className={`p-1.5 rounded hover:bg-zinc-200 transition-colors ${isEffectivelyHidden ? 'text-zinc-400' : 'text-zinc-500'}`}
            >
              {isEffectivelyHidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button
              onClick={(e) => isFolder ? deleteFolder(node.part.tag, e) : deletePart(node.index, e)}
              className="p-1.5 rounded hover:bg-red-100 hover:text-red-500 text-zinc-400 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div className="space-y-0.5">
            {node.children.map(child => renderHierarchyNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Load initial data from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem('ai_3d_gallery');
    if (saved) {
      try {
        setSavedModels(JSON.parse(saved));
      } catch (e) {
        console.error("Error loading gallery", e);
      }
    }

    const session = localStorage.getItem('ai_3d_session');
    if (session) {
      try {
        const data = JSON.parse(session);
        const { 
          parts, 
          originalParts: savedOriginalParts,
          suggestions, 
          suggestion, 
          hasGenerated, 
          currentModelPrompt: savedPrompt,
          folders: savedFolders,
          hiddenFolders: savedHiddenFolders,
          hiddenPartIndices: savedHiddenPartIndices,
          expandedNodes: savedExpandedNodes
        } = data;

        setParts(parts);
        if (savedOriginalParts) {
          setOriginalParts(savedOriginalParts);
        } else {
          setOriginalParts(JSON.parse(JSON.stringify(parts)));
        }
        setSuggestions(suggestions || (suggestion ? [{ text: suggestion, consciousnessScore: 0 }] : []));
        setHasGenerated(hasGenerated);
        if (savedPrompt) setCurrentModelPrompt(savedPrompt);
        if (savedFolders) setFolders(savedFolders);
        if (savedHiddenFolders) setHiddenFolders(new Set(savedHiddenFolders));
        if (savedHiddenPartIndices) setHiddenPartIndices(new Set(savedHiddenPartIndices));
        if (savedExpandedNodes) setExpandedNodes(new Set(savedExpandedNodes));
      } catch (e) {
        console.error("Error loading session", e);
      }
    }
  }, []);

  // Persist current session
  useEffect(() => {
    if (hasGenerated) {
      localStorage.setItem('ai_3d_session', JSON.stringify({ 
        parts, 
        originalParts,
        suggestions, 
        hasGenerated,
        currentModelPrompt,
        folders,
        hiddenFolders: Array.from(hiddenFolders),
        hiddenPartIndices: Array.from(hiddenPartIndices),
        expandedNodes: Array.from(expandedNodes)
      }));
    }
  }, [parts, originalParts, suggestions, hasGenerated, currentModelPrompt, folders, hiddenFolders, hiddenPartIndices, expandedNodes]);

  const addLog = (msg: string) => {
    setDebugLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    if (showDebug && debugRef.current) {
      debugRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [showDebug]);

  const saveToGallery = async () => {
    if (!parts.length) return;
    
    let thumbnail = '';
    if (viewerRef.current) {
      thumbnail = viewerRef.current.takeScreenshot();
    }

    const name = currentModelPrompt || `Modelo ${new Date().toLocaleTimeString()}`;
    const newModel: SavedModel = {
      id: crypto.randomUUID(),
      name: name.length > 50 ? name.substring(0, 50) + '...' : name,
      prompt: currentModelPrompt || 'Generación manual',
      thumbnail,
      parts,
      originalParts,
      suggestions,
      timestamp: Date.now()
    };
    const updated = [newModel, ...savedModels];
    setSavedModels(updated);
    localStorage.setItem('ai_3d_gallery', JSON.stringify(updated));
    addLog(`💾 Modelo guardado en la galería: ${newModel.name}`);
  };

  const deleteFromGallery = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedModels.filter(m => m.id !== id);
    setSavedModels(updated);
    localStorage.setItem('ai_3d_gallery', JSON.stringify(updated));
  };

  const loadFromGallery = (model: SavedModel) => {
    setParts(model.parts);
    if (model.originalParts) {
      setOriginalParts(model.originalParts);
    } else {
      setOriginalParts(JSON.parse(JSON.stringify(model.parts)));
    }
    setSuggestions(model.suggestions || (model.suggestion ? [model.suggestion] : []));
    setHasGenerated(true);
    setPrompt('');
    setCurrentModelPrompt(model.prompt);
    addLog(`📂 Modelo cargado desde la galería: ${model.name}`);
  };

  const hideAllParts = () => {
    const allIndices = new Set<number>(parts.map((_, i) => i));
    setHiddenPartIndices(allIndices);
  };

  const showAllParts = () => {
    setHiddenPartIndices(new Set());
  };

  const startGeneration = async (activePrompt: string, isFresh: boolean = false) => {
    setIsLoading(true);
    setPendingAction(null);
    setElapsedTime(0);
    setLastGenerationTime(null);
    addLog(`--- Nueva Petición ---`);
    
    // Scroll to top to see the result
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    timerRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 100);
    }, 100);

    const startTime = Date.now();
    try {
      const result = await generate3DObject(
        activePrompt, 
        (hasGenerated && !isFresh) ? parts : [],
        (info) => addLog(info),
        selectedModel
      );
      
      if (result.parts && result.parts.length > 0) {
        // If it's an iteration, group NEW parts in folders
        if (hasGenerated && !isFresh) {
          const newParts = result.parts.filter(p => !parts.some(oldP => oldP.tag === p.tag));
          if (newParts.length > 0) {
            const defaultFolderName = `Mejora ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
            const foldersToExpand = new Set<string>();

            result.parts = result.parts.map(p => {
              const isNew = newParts.some(np => np.tag === p.tag);
              if (isNew) {
                // Use folder from Gemini if provided, otherwise use default
                const folderName = p.folder || defaultFolderName;
                foldersToExpand.add(folderName);
                return { ...p, folder: folderName };
              }
              // For existing parts, preserve the folder if Gemini didn't return one
              const oldPart = parts.find(op => op.tag === p.tag);
              return { ...p, folder: p.folder || oldPart?.folder };
            });

            // Update folders list and expanded state
            setFolders(prev => {
              const next = [...prev];
              foldersToExpand.forEach(f => {
                if (!next.some(folder => folder.name === f)) {
                  next.push({
                    name: f,
                    position: [0, 0, 0],
                    scale: [1, 1, 1],
                    rotation: [0, 0, 0],
                    visible: true
                  });
                }
              });
              return next;
            });
            setExpandedNodes(prev => {
              const next = new Set(prev);
              foldersToExpand.forEach(f => next.add(f));
              return next;
            });
          }
        }

        const processedParts = result.parts.map(p => {
          // Auto-group eyes if they are floating without a folder
          if (p.tag.toLowerCase().includes('eye') && !p.folder) {
            return { ...p, folder: 'Ojos' };
          }
          return p;
        });

        // Ensure all folders used in parts exist in the folders state
        setFolders(prev => {
          const next = [...prev];
          processedParts.forEach(p => {
            if (p.folder && !next.some(f => f.name === p.folder)) {
              next.push({
                name: p.folder,
                position: [0, 0, 0],
                scale: [1, 1, 1],
                rotation: [0, 0, 0],
                visible: true
              });
            }
          });
          return next;
        });

        setParts(processedParts);
        setOriginalParts(JSON.parse(JSON.stringify(processedParts)));
        addToHistory(processedParts);
        setSuggestions(result.suggestions || []);
        
        // Update the active model prompt tracking
        if (hasGenerated && !isFresh) {
          setCurrentModelPrompt(prev => `${prev} + ${activePrompt}`);
        } else {
          setCurrentModelPrompt(activePrompt);
        }
        
        setHasGenerated(true);
        setPrompt('');
        const finalTime = Date.now() - startTime;
        setLastGenerationTime(finalTime);
        addLog(`✅ ÉXITO: Generación finalizada en ${(finalTime / 1000).toFixed(2)}s`);
      } else {
        // If result is empty or failed but didn't throw (e.g. timeout handled inside gemini.ts)
        throw new Error("La generación no devolvió resultados válidos.");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addLog(`❌ ERROR: ${errorMsg}`);
      // Ensure we don't log success if we caught an error
    } finally {
      setIsLoading(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleGenerateRequest = (e?: React.FormEvent, customPrompt?: string) => {
    e?.preventDefault();
    const activePrompt = customPrompt || prompt;
    if (!activePrompt.trim() || isLoading) return;

    if (customPrompt) {
      setPrompt(customPrompt);
      setTimeout(() => {
        promptRef.current?.focus();
        generatorRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return; // Don't trigger generation immediately
    }

    // Pedir confirmación antes de gastar quota
    setPendingAction({ prompt: activePrompt, isCustom: !!customPrompt });
  };

  const handleReset = () => {
    setParts([]);
    setSuggestions([]);
    setHasGenerated(false);
    setCurrentModelPrompt('');
    setDebugLogs([]);
    setSelectedPartIndex(null);
    setHiddenPartIndices(new Set());
    setFolders([]);
    setExpandedNodes(new Set());
    promptRef.current?.focus();
    generatorRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToGenerator = () => {
    generatorRef.current?.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => promptRef.current?.focus(), 500);
  };

  const deletePart = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const partToDelete = parts[index];
    const newParts = parts.filter((_, i) => i !== index);
    const updatedParts = newParts.map(p => p.parent === partToDelete.tag ? { ...p, parent: undefined } : p);
    setParts(updatedParts);
    addToHistory(updatedParts);
    if (selectedPartIndex === index) setSelectedPartIndex(null);
    else if (selectedPartIndex !== null && selectedPartIndex > index) setSelectedPartIndex(selectedPartIndex - 1);
    
    // Update hidden indices
    const newHidden = new Set<number>();
    hiddenPartIndices.forEach(idx => {
      if (idx < index) newHidden.add(idx);
      else if (idx > index) newHidden.add(idx - 1);
    });
    setHiddenPartIndices(newHidden);
  };

  const deleteFolder = (tag: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Delete all parts that belong to this folder
    const newParts = parts.filter(p => p.folder !== tag);
    // Also clean up parents that might have been deleted
    const deletedTags = parts.filter(p => p.folder === tag).map(p => p.tag);
    const updatedParts = newParts.map(p => deletedTags.includes(p.parent || '') ? { ...p, parent: undefined } : p);
    
    setParts(updatedParts);
    addToHistory(updatedParts);
    setFolders(folders.filter(f => f.name !== tag));
    
    if (selectedPartIndex !== null) setSelectedPartIndex(null);
    if (selectedFolderIndex !== null && folders[selectedFolderIndex]?.name === tag) setSelectedFolderIndex(null);

    setExpandedNodes(prev => {
      const next = new Set(prev);
      next.delete(tag);
      return next;
    });
    setHiddenFolders(prev => {
      const next = new Set(prev);
      next.delete(tag);
      return next;
    });
  };

  const toggleVisibility = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newHidden = new Set(hiddenPartIndices);
    if (newHidden.has(index)) {
      newHidden.delete(index);
    } else {
      newHidden.add(index);
    }
    setHiddenPartIndices(newHidden);
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#F8F9FA] text-zinc-900 font-sans selection:bg-blue-100">
      {/* Header */}
      <header ref={headerRef} className="border-b border-zinc-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
              <Box size={20} />
            </div>
            <h1 className="font-semibold text-sm sm:text-lg tracking-tight whitespace-nowrap">AI 3D Shape Gen</h1>
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            <button
              onClick={() => setShowDebug(!showDebug)}
              className={`px-2 sm:px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors shrink-0 ${showDebug ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}
            >
              Debug
            </button>
            <button
              onClick={scrollToGenerator}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-zinc-100 text-zinc-900 rounded-full text-xs sm:text-sm font-medium hover:bg-zinc-200 transition-colors shadow-sm shrink-0"
            >
              <Plus size={14} />
              <span className="hidden xs:inline">{hasGenerated ? 'Refinar' : 'Nuevo'}</span>
              <span className="xs:hidden">{hasGenerated ? 'Ref' : 'Nvo'}</span>
            </button>
            <button
              onClick={() => viewerRef.current?.exportToGLB()}
              disabled={!hasGenerated}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-zinc-100 text-zinc-900 rounded-full text-xs sm:text-sm font-medium hover:bg-zinc-200 transition-colors shadow-sm disabled:opacity-50 shrink-0"
              title="Export GLB"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Export GLB</span>
            </button>
            {hasGenerated && (
              <button
                onClick={() => {
                  const json = JSON.stringify(parts, null, 2);
                  navigator.clipboard.writeText(json);
                  addLog("📋 JSON copiado al portapapeles");
                }}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-zinc-100 text-zinc-900 rounded-full text-xs sm:text-sm font-medium hover:bg-zinc-200 transition-colors shadow-sm shrink-0"
                title="Copiar JSON"
              >
                <Copy size={14} />
                <span className="hidden md:inline">Copiar JSON</span>
              </button>
            )}
            {hasGenerated && (
              <button
                onClick={saveToGallery}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-full text-xs sm:text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm shrink-0"
              >
                <Save size={14} />
                <span className="hidden xs:inline">Guardar</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-0 sm:px-4 py-4 sm:py-8 space-y-8 sm:space-y-12">
        {/* 1. Main Viewport Area with Floating Panels */}
        <div className="relative h-[500px] sm:h-[600px] lg:h-[750px] bg-white sm:rounded-3xl border-y sm:border border-zinc-200 shadow-xl overflow-hidden group">
          {/* 3D Viewer */}
          <div className="absolute inset-0">
            {parts.length > 0 ? (
              <ThreeViewer 
                ref={viewerRef} 
                parts={parts} 
                folders={folders}
                selectedPartIndex={selectedPartIndex}
                selectedFolderIndex={selectedFolderIndex}
                hiddenPartIndices={effectiveHiddenIndices}
                onSelectPart={onSelectPart}
                onSelectFolder={onSelectFolderByName}
                onDoubleClickPart={onDoubleClickPart}
                onUpdatePartTransform={updatePartTransform}
                transformMode={transformMode}
                activeSkills={activeSkills}
                sceneSettings={sceneSettings}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 gap-4 bg-zinc-50">
                <Box size={64} strokeWidth={1} className="opacity-20" />
                <p className="text-lg font-medium">Tu creación 3D aparecerá aquí</p>
              </div>
            )}
          </div>

          {/* Quick Rotation Overlay (Bottom) */}
          <AnimatePresence>
            {selectedPartIndex !== null && (
              <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                className="absolute bottom-4 left-4 right-4 sm:left-6 sm:right-24 bg-white/90 backdrop-blur-xl border border-zinc-200 shadow-2xl rounded-2xl sm:rounded-3xl z-30 p-3 sm:p-4"
              >
                <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6">
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        const newParts = [...parts];
                        newParts[selectedPartIndex!] = { ...newParts[selectedPartIndex!], rotation: [0, 0, 0] };
                        setParts(newParts);
                        addLog(`🔄 Rotación reseteada: ${parts[selectedPartIndex!].tag}`);
                      }}
                      className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition-colors"
                      title="Resetear Rotación"
                    >
                      <RotateCcw size={16} />
                    </button>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-zinc-800 uppercase tracking-tight leading-none">Rotación</span>
                      <span className="text-[9px] text-zinc-400 font-medium truncate max-w-[100px]">
                        {parts[selectedPartIndex] ? parts[selectedPartIndex].tag : ''}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex-1 grid grid-cols-3 gap-3 sm:gap-6 w-full">
                    {['X', 'Y', 'Z'].map((axis, i) => {
                      const part = parts[selectedPartIndex!];
                      if (!part || !part.rotation) return null;
                      const degValue = Math.round(part.rotation[i] * (180 / Math.PI));
                      return (
                        <div key={axis} className="space-y-1.5">
                          <div className="flex justify-between items-center px-0.5">
                            <span className="text-[9px] font-bold text-zinc-500">{axis}</span>
                            <span className="text-[9px] font-mono text-zinc-400">{degValue}°</span>
                          </div>
                          <input
                            type="range"
                            min={-180}
                            max={180}
                            step={1}
                            value={degValue}
                            onChange={(e) => updatePartTransform(selectedPartIndex!, 'rotation', parseFloat(e.target.value) * (Math.PI / 180), i)}
                            className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                          />
                        </div>
                      );
                    })}
                  </div>

                  <button 
                    onClick={() => setSelectedPartIndex(null)}
                    className="p-2 hover:bg-zinc-100 rounded-xl text-zinc-400 transition-colors shrink-0"
                  >
                    <X size={18} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loading Overlay */}
          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-white/40 backdrop-blur-[2px] flex items-center justify-center z-30"
              >
                <div className="bg-white px-8 py-5 rounded-full shadow-2xl border border-zinc-100 flex items-center gap-4">
                  <Loader2 size={24} className="animate-spin text-blue-600" />
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-zinc-800">Gemini está esculpiendo...</span>
                    <span className="text-[10px] font-mono text-blue-500">{(elapsedTime / 1000).toFixed(1)}s</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Floating Toolbar (Photoshop Style) */}
          <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex flex-col gap-2 z-20">
            {[
              { id: 'hierarchy', icon: Layers, label: 'Jerarquía' },
              { id: 'properties', icon: Settings2, label: 'Propiedades' },
              { id: 'scene', icon: Eye, label: 'Escena' }
            ].map((panel) => (
              <button
                key={panel.id}
                onClick={() => setActivePanel(activePanel === panel.id ? null : panel.id as any)}
                className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl shadow-lg transition-all flex items-center justify-center group/btn border ${
                  activePanel === panel.id 
                    ? 'bg-blue-600 text-white border-blue-500 scale-110' 
                    : 'bg-white/90 backdrop-blur-md text-zinc-600 hover:bg-white hover:scale-105 border-white/20'
                }`}
                title={panel.label}
              >
                <panel.icon size={18} className="sm:w-5 sm:h-5" />
                <span className="hidden sm:block absolute right-full mr-3 px-2 py-1 bg-zinc-800 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none uppercase tracking-wider whitespace-nowrap">
                  {panel.label}
                </span>
              </button>
            ))}

            <button
              onClick={() => setIsAnimationStageOpen(true)}
              className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl shadow-lg transition-all flex items-center justify-center group/btn border bg-white/90 backdrop-blur-md text-zinc-600 hover:bg-white hover:scale-105 border-white/20"
              title="Animaciones"
            >
              <Play size={18} className="sm:w-5 sm:h-5" />
              <span className="hidden sm:block absolute right-full mr-3 px-2 py-1 bg-zinc-800 text-white text-[10px] font-bold rounded opacity-0 group-hover/btn:opacity-100 transition-opacity pointer-events-none uppercase tracking-wider whitespace-nowrap">
                Animaciones
              </span>
            </button>

            {/* Undo/Redo Buttons */}
            <div className="mt-2 flex flex-col gap-2">
              <button
                onClick={undo}
                disabled={historyIndex <= 0}
                className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white/90 backdrop-blur-md shadow-lg border border-white/20 text-zinc-600 hover:bg-white hover:scale-105 disabled:opacity-30 disabled:hover:scale-100 transition-all flex items-center justify-center"
                title="Deshacer (Ctrl+Z)"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={redo}
                disabled={historyIndex >= history.length - 1}
                className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white/90 backdrop-blur-md shadow-lg border border-white/20 text-zinc-600 hover:bg-white hover:scale-105 disabled:opacity-30 disabled:hover:scale-100 transition-all flex items-center justify-center"
                title="Rehacer (Ctrl+Y)"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Overlay Panels */}
          <AnimatePresence>
            {activePanel && (
              <motion.div
                initial={{ x: '100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute inset-y-0 right-0 w-full sm:w-80 sm:top-6 sm:bottom-6 sm:right-24 bg-white/95 backdrop-blur-xl border-l sm:border border-zinc-200 shadow-2xl sm:rounded-3xl z-40 flex flex-col overflow-hidden"
              >
                {/* Panel Tabs (Photoshop Style) */}
                <div className="flex border-b border-zinc-100 bg-zinc-50/50">
                  {[
                    { id: 'hierarchy', icon: Layers, label: 'Jerarquía' },
                    { id: 'properties', icon: Settings2, label: 'Propiedades' },
                    { id: 'scene', icon: Eye, label: 'Escena' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActivePanel(tab.id as any)}
                      className={`flex-1 py-3 flex flex-col items-center gap-1 transition-all border-b-2 ${
                        activePanel === tab.id 
                          ? 'border-blue-500 text-blue-600 bg-white' 
                          : 'border-transparent text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100/50'
                      }`}
                    >
                      <tab.icon size={14} />
                      <span className="text-[8px] font-bold uppercase tracking-wider">{tab.label}</span>
                    </button>
                  ))}
                  <button 
                    onClick={() => setActivePanel(null)}
                    className="px-3 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100/50 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Panel Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {activePanel === 'hierarchy' && (
                    <div className="flex flex-col h-full">
                      <div className="p-2 sm:p-3 border-b border-zinc-50 flex items-center gap-2">
                        <button 
                          onClick={addFolder}
                          className="flex-1 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-zinc-600 transition-colors flex items-center justify-center gap-2 text-[9px] sm:text-[10px] font-bold uppercase"
                        >
                          <Save size={12} className="sm:w-3 sm:h-3" />
                          Carpeta
                        </button>
                        <button 
                          onClick={hiddenPartIndices.size === parts.length ? showAllParts : hideAllParts}
                          className="flex-1 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-zinc-600 transition-colors flex items-center justify-center gap-2 text-[9px] sm:text-[10px] font-bold uppercase"
                        >
                          {hiddenPartIndices.size === parts.length ? <Eye size={12} className="sm:w-3 sm:h-3" /> : <EyeOff size={12} className="sm:w-3 sm:h-3" />}
                          {hiddenPartIndices.size === parts.length ? 'Mostrar' : 'Ocultar'}
                        </button>
                      </div>
                      
                      {/* Search Bar */}
                      <div className="px-3 py-2 border-b border-zinc-50">
                        <div className="relative">
                          <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                          <input 
                            type="text"
                            placeholder="Buscar en jerarquía..."
                            value={hierarchySearch}
                            onChange={(e) => setHierarchySearch(e.target.value)}
                            className="w-full pl-7 pr-3 py-1.5 bg-zinc-50 border-none rounded-lg text-[10px] outline-none focus:ring-1 focus:ring-blue-500/20 placeholder:text-zinc-400"
                          />
                          {hierarchySearch && (
                            <button 
                              onClick={() => setHierarchySearch('')}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                            >
                              <X size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="px-4 py-2 border-b border-zinc-50 flex items-center justify-between text-[8px] font-bold text-zinc-400 uppercase tracking-widest bg-zinc-50/20">
                        <span>Nombre</span>
                        <span>Ver</span>
                      </div>
                      <div className="p-3 space-y-1">
                        {parts.length === 0 && folders.length === 0 ? (
                          <div className="py-12 flex flex-col items-center justify-center text-center opacity-20">
                            <Layers size={24} className="mb-2" />
                            <p className="text-[10px] italic">Vacío</p>
                          </div>
                        ) : (
                          hierarchy.map(node => renderHierarchyNode(node))
                        )}
                      </div>
                    </div>
                  )}

                  {activePanel === 'animations' && (
                    <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar h-full">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-zinc-900 text-white rounded-xl">
                          <Play size={18} />
                        </div>
                        <h3 className="font-bold text-zinc-900 uppercase text-[10px] tracking-widest">Habilidades</h3>
                      </div>

                      <button
                        onClick={() => setIsAnimationStageOpen(true)}
                        className="w-full py-3 px-4 bg-blue-600 text-white hover:bg-blue-700 rounded-2xl font-bold text-[10px] uppercase tracking-wider transition-colors flex items-center justify-center gap-2 mb-4 shadow-lg shadow-blue-200"
                      >
                        <Maximize2 size={14} />
                        Abrir en Escenario
                      </button>
                      
                      <div className="grid grid-cols-1 gap-2">
                        {[
                          { id: 'caminar', name: 'Caminar', desc: 'Locomoción terrestre' },
                          { id: 'brazos', name: 'Brazos', desc: 'Movimiento lateral' },
                          { id: 'colgados', name: 'Colgados', desc: 'Suspensión pendular' },
                          { id: 'vuelo', name: 'Vuelo', desc: 'Propulsión energética' },
                          { id: 'analisis', name: 'Análisis', desc: 'Escrutinio y rotación' },
                          { id: 'parpadeo', name: 'Parpadeo', desc: 'Reflejo ocular' },
                        ].map((skill) => (
                          <button
                            key={skill.id}
                            onClick={() => toggleSkill(skill.id)}
                            className={`p-3 rounded-2xl border text-left transition-all flex items-center justify-between group ${
                              activeSkills.has(skill.id)
                                ? 'bg-zinc-900 border-zinc-900 text-white shadow-md'
                                : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-400'
                            }`}
                          >
                            <div>
                              <div className="font-bold text-xs">{skill.name}</div>
                              <div className={`text-[9px] opacity-70 ${activeSkills.has(skill.id) ? 'text-zinc-300' : 'text-zinc-500'}`}>
                                {skill.desc}
                              </div>
                            </div>
                            {activeSkills.has(skill.id) && (
                              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                            )}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={stopAllAnimations}
                        className="w-full py-3 px-4 bg-red-50 text-red-600 hover:bg-red-100 rounded-2xl font-bold text-[10px] uppercase tracking-wider transition-colors flex items-center justify-center gap-2 mt-4"
                      >
                        <RotateCcw size={14} />
                        Detener Todo
                      </button>

                      {/* Animation Debug Section */}
                      <div className="mt-6 pt-6 border-t border-zinc-100 space-y-3">
                        <div className="flex items-center gap-2 text-zinc-400">
                          <Info size={14} />
                          <span className="text-[9px] font-bold uppercase tracking-widest">Depuración de Animación</span>
                        </div>
                        
                        {animationDebug ? (
                          <div className="space-y-3">
                            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 space-y-2">
                              <div className="flex justify-between text-[9px]">
                                <span className="text-zinc-500 font-medium">Nodos Identificados:</span>
                                <span className="text-zinc-900 font-bold">{animationDebug.nodeCount}</span>
                              </div>
                              <div className="flex justify-between text-[9px]">
                                <span className="text-zinc-500 font-medium">Habilidades Activas:</span>
                                <span className="text-zinc-900 font-bold">{animationDebug.activeSkills.length}</span>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-tight">Mapeo de Habilidades</span>
                              <div className="space-y-1">
                                {Object.entries(animationDebug.skillTargets).map(([skill, targets]: [string, any]) => (
                                  <div key={skill} className="text-[9px] p-2 bg-white border border-zinc-100 rounded-lg">
                                    <div className="font-bold text-zinc-700 capitalize mb-1">{skill}</div>
                                    {targets.length > 0 ? (
                                      <div className="space-y-0.5">
                                        {targets.map((t: string, i: number) => (
                                          <div key={i} className="text-zinc-500 flex items-center gap-1">
                                            <div className="w-1 h-1 bg-green-400 rounded-full" />
                                            {t}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="text-red-400 italic">No se encontraron nodos compatibles</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="py-8 text-center text-zinc-300 italic text-[10px]">
                            Cargando datos de diagnóstico...
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activePanel === 'properties' && (
                    <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto custom-scrollbar h-full">
                      {(() => {
                        const selectedObj = selectedFolderIndex !== null && folders[selectedFolderIndex] 
                          ? { type: 'folder', index: -1000 - selectedFolderIndex, data: folders[selectedFolderIndex] }
                          : selectedPartIndex !== null && parts[selectedPartIndex]
                            ? { type: 'part', index: selectedPartIndex, data: parts[selectedPartIndex] }
                            : null;

                        if (!selectedObj) {
                          return (
                            <div className="py-20 flex flex-col items-center justify-center text-center space-y-3 opacity-20">
                              <Settings2 size={32} className="text-zinc-300" />
                              <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest">Selecciona una parte o carpeta</p>
                            </div>
                          );
                        }

                        const isFolder = selectedObj.type === 'folder';
                        const data = selectedObj.data;
                        const index = selectedObj.index;

                        return (
                          <div className="space-y-4">
                            {/* Header: Name and Basic Actions */}
                            <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-100">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className={`w-2 h-2 rounded-full shrink-0 ${isFolder ? 'bg-amber-500' : ''}`} style={!isFolder ? { backgroundColor: (data as ShapePart).color } : {}} />
                                {editingNodeId === (isFolder ? `folder_${(data as FolderData).name}` : `part_${selectedPartIndex}`) ? (
                                  <div className="flex items-center gap-1 flex-1">
                                    <input 
                                      autoFocus
                                      type="text"
                                      value={tempName}
                                      onChange={(e) => setTempName(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveRename(isFolder ? Math.abs(index + 1000) : index, isFolder);
                                        if (e.key === 'Escape') setEditingNodeId(null);
                                      }}
                                      className="text-[10px] sm:text-xs font-bold text-zinc-800 bg-white border border-blue-500/30 rounded px-1 py-0.5 outline-none w-full"
                                    />
                                    <button 
                                      onClick={() => saveRename(isFolder ? Math.abs(index + 1000) : index, isFolder)}
                                      className="p-1 text-green-600 hover:bg-green-50 rounded"
                                    >
                                      <Plus size={12} className="rotate-45" />
                                    </button>
                                  </div>
                                ) : (
                                  <span 
                                    onClick={() => renameNode(isFolder ? Math.abs(index + 1000) : index, isFolder)}
                                    className="text-[10px] sm:text-xs font-bold text-zinc-800 truncate cursor-pointer hover:text-blue-600 transition-colors"
                                  >
                                    {isFolder ? (data as FolderData).name : (data as ShapePart).tag}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button 
                                  onClick={() => renameNode(isFolder ? Math.abs(index + 1000) : index, isFolder)}
                                  className="p-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-zinc-500 transition-colors"
                                  title="Renombrar"
                                >
                                  <Type size={12} />
                                </button>
                                <button 
                                  onClick={() => {
                                    const json = JSON.stringify(isFolder ? { folder: data, parts: parts.filter(p => p.folder === (data as FolderData).name) } : data, null, 2);
                                    navigator.clipboard.writeText(json);
                                    addLog(`📋 JSON de ${isFolder ? 'carpeta' : 'parte'} copiado`);
                                  }}
                                  className="p-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-zinc-500 transition-colors"
                                  title="Copiar JSON"
                                >
                                  <Copy size={12} />
                                </button>
                                <div className="flex bg-zinc-100 p-0.5 rounded-lg">
                                  <button 
                                    onClick={() => setTransformMode('translate')}
                                    className={`px-2 py-1 rounded-md text-[7px] font-bold uppercase transition-all ${transformMode === 'translate' ? 'bg-white text-blue-600 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
                                  >
                                    Pos
                                  </button>
                                  <button 
                                    onClick={() => setTransformMode('rotate')}
                                    className={`px-2 py-1 rounded-md text-[7px] font-bold uppercase transition-all ${transformMode === 'rotate' ? 'bg-white text-blue-600 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
                                  >
                                    Rot
                                  </button>
                                  <button 
                                    onClick={() => setTransformMode('scale')}
                                    className={`px-2 py-1 rounded-md text-[7px] font-bold uppercase transition-all ${transformMode === 'scale' ? 'bg-white text-blue-600 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
                                  >
                                    Esc
                                  </button>
                                </div>
                                <button 
                                  onClick={() => resetPartTransform(index)}
                                  className="p-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-zinc-500 transition-colors"
                                  title="Resetear todo"
                                >
                                  <RotateCcw size={12} />
                                </button>
                              </div>
                            </div>

                            {/* Main Transforms: Position, Scale, Rotation */}
                            <div className="space-y-4">
                              {[
                                { label: 'Posición', key: 'position' as const, min: -10, max: 10, step: 0.1 },
                                { label: 'Escala', key: 'scale' as const, min: 0.1, max: 5, step: 0.1 }
                              ].map((transform) => (
                                <div key={transform.key} className="space-y-2">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[7px] sm:text-[8px] font-bold text-zinc-400 uppercase">{transform.label}</span>
                                    <div className="flex items-center gap-2">
                                      {transform.key === 'scale' && (
                                        <button 
                                          onClick={() => setIsUniformScale(!isUniformScale)}
                                          className={`text-[7px] font-bold px-1.5 py-0.5 rounded transition-all ${isUniformScale ? 'bg-blue-100 text-blue-600' : 'bg-zinc-100 text-zinc-400'}`}
                                          title="Escala Uniforme"
                                        >
                                          UNIFORME
                                        </button>
                                      )}
                                      {!isFolder && (
                                        <button 
                                          onClick={() => resetPartTransform(index, transform.key)}
                                          className="text-zinc-300 hover:text-zinc-500 transition-colors"
                                        >
                                          <RotateCcw size={10} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 gap-2">
                                    {['X', 'Y', 'Z'].map((axis, i) => {
                                      if (!data || !data[transform.key] || data[transform.key][i] === undefined) return null;
                                      const axisColor = i === 0 ? 'accent-red-500' : i === 1 ? 'accent-green-500' : 'accent-yellow-500';
                                      const axisLabelColor = i === 0 ? 'text-red-500' : i === 1 ? 'text-green-500' : 'text-yellow-500';
                                      return (
                                        <div key={axis} className="flex items-center gap-3">
                                          <span className={`text-[8px] font-mono w-2 ${axisLabelColor}`}>{axis}</span>
                                          <input
                                            type="range"
                                            min={transform.min}
                                            max={transform.max}
                                            step={transform.step}
                                            value={data[transform.key][i]}
                                            onChange={(e) => updatePartTransform(index, transform.key, parseFloat(e.target.value), i)}
                                            className={`flex-1 h-1 bg-zinc-100 rounded-lg appearance-none cursor-pointer ${axisColor}`}
                                          />
                                          <NumberInput
                                            value={data[transform.key][i]}
                                            onChange={(val) => updatePartTransform(index, transform.key, val, i)}
                                            className="w-10 bg-zinc-50 rounded px-1 py-0.5 text-[9px] font-mono text-right outline-none focus:bg-white focus:ring-1 focus:ring-blue-500/20"
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}

                              {/* Rotation */}
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <span className="text-[7px] sm:text-[8px] font-bold text-zinc-400 uppercase">Rotación (Grados)</span>
                                  <div className="flex items-center gap-2">
                                    <button 
                                      onClick={() => updatePartTransform(index, 'rotation', [0, 0, 0])}
                                      className="text-[7px] font-bold px-1.5 py-0.5 bg-zinc-100 text-zinc-400 rounded hover:bg-zinc-200 transition-all"
                                      title="Poner a 0º"
                                    >
                                      0º
                                    </button>
                                    <button 
                                      onClick={() => resetPartTransform(index, 'rotation')}
                                      className="text-zinc-300 hover:text-zinc-500 transition-colors"
                                    >
                                      <RotateCcw size={10} />
                                    </button>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 gap-2">
                                  {['X', 'Y', 'Z'].map((axis, i) => {
                                    if (!data || !data.rotation || data.rotation[i] === undefined) return null;
                                    const degValue = Math.round(data.rotation[i] * (180 / Math.PI));
                                    const axisColor = i === 0 ? 'accent-red-500' : i === 1 ? 'accent-green-500' : 'accent-yellow-500';
                                    const axisLabelColor = i === 0 ? 'text-red-500' : i === 1 ? 'text-green-500' : 'text-yellow-500';
                                    return (
                                      <div key={axis} className="flex items-center gap-3">
                                        <span className={`text-[8px] font-mono w-2 ${axisLabelColor}`}>{axis}</span>
                                        <input
                                          type="range"
                                          min={-180}
                                          max={180}
                                          step={1}
                                          value={degValue}
                                          onChange={(e) => updatePartTransform(index, 'rotation', parseFloat(e.target.value) * (Math.PI / 180), i)}
                                          className={`flex-1 h-1 bg-zinc-100 rounded-lg appearance-none cursor-pointer ${axisColor}`}
                                        />
                                        <NumberInput
                                          value={degValue}
                                          onChange={(val) => updatePartTransform(index, 'rotation', val * (Math.PI / 180), i)}
                                          className="w-10 bg-zinc-50 rounded px-1 py-0.5 text-[9px] font-mono text-right outline-none focus:bg-white focus:ring-1 focus:ring-blue-500/20"
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Pivot Offset */}
                              {!isFolder && (
                                <div className="space-y-2 pt-2 border-t border-zinc-50">
                                  <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-1.5">
                                      <Target size={10} className="text-zinc-400" />
                                      <span className="text-[7px] sm:text-[8px] font-bold text-zinc-400 uppercase">Punto de Giro (Offset)</span>
                                    </div>
                                    <button 
                                      onClick={() => resetPartTransform(index, 'pivotOffset')}
                                      className="text-zinc-300 hover:text-zinc-500 transition-colors"
                                      title="Resetear Punto de Giro"
                                    >
                                      <RotateCcw size={10} />
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 gap-2">
                                    {['X', 'Y', 'Z'].map((axis, i) => {
                                      const pivotValue = (data as ShapePart).pivotOffset ? (data as ShapePart).pivotOffset![i] : 0;
                                      return (
                                        <div key={axis} className="flex items-center gap-3">
                                          <span className="text-[8px] font-mono w-2 text-zinc-400">{axis}</span>
                                          <input
                                            type="range"
                                            min="-5"
                                            max="5"
                                            step="0.01"
                                            value={pivotValue}
                                            onChange={(e) => {
                                              const currentOffset = (data as ShapePart).pivotOffset || [0, 0, 0];
                                              const newOffset = [...currentOffset] as [number, number, number];
                                              newOffset[i] = parseFloat(e.target.value);
                                              updatePartTransform(index, 'pivotOffset', newOffset);
                                            }}
                                            className="flex-1 h-1 bg-zinc-100 rounded-lg appearance-none cursor-pointer accent-zinc-400"
                                          />
                                          <NumberInput
                                            value={pivotValue}
                                            onChange={(val) => {
                                              const currentOffset = (data as ShapePart).pivotOffset || [0, 0, 0];
                                              const newOffset = [...currentOffset] as [number, number, number];
                                              newOffset[i] = val;
                                              updatePartTransform(index, 'pivotOffset', newOffset);
                                            }}
                                            className="w-10 bg-zinc-50 rounded px-1 py-0.5 text-[9px] font-mono text-right outline-none focus:bg-white focus:ring-1 focus:ring-blue-500/20"
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Secondary Details: Hierarchy, Type, Color */}
                            <div className="pt-4 border-t border-zinc-100 space-y-3">
                              {!isFolder && (
                                <>
                                  <div className="flex items-center justify-between text-[9px]">
                                    <span className="font-bold text-zinc-400 uppercase">Tipo</span>
                                    <div className="flex items-center gap-1.5 text-zinc-600 font-medium">
                                      <Box size={10} className="text-blue-500" />
                                      <span className="capitalize">{(data as ShapePart).type}</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between text-[9px]">
                                    <span className="font-bold text-zinc-400 uppercase">Color</span>
                                    <div className="flex items-center gap-2 relative group/color">
                                      <input 
                                        type="color"
                                        value={(data as ShapePart).color}
                                        onChange={(e) => updatePartColor(index, e.target.value)}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                      />
                                      <span className="font-mono text-zinc-500">{(data as ShapePart).color.toUpperCase()}</span>
                                      <div className="w-4 h-4 rounded border border-zinc-200 shadow-sm" style={{ backgroundColor: (data as ShapePart).color }} />
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between text-[9px]">
                                      <span className="font-bold text-zinc-400 uppercase">Carpeta (UI)</span>
                                      <select
                                        value={(data as ShapePart).folder || ""}
                                        onChange={(e) => updatePartFolder(index, e.target.value)}
                                        className="bg-zinc-50 rounded px-1 py-0.5 text-[9px] border-none outline-none focus:ring-1 focus:ring-blue-500/20"
                                      >
                                        <option value="">Ninguna</option>
                                        {folders.map((f, fIdx) => (
                                          <option key={`${f.name}-${fIdx}`} value={f.name}>{f.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="flex items-center justify-between text-[9px]">
                                      <span className="font-bold text-zinc-400 uppercase">Padre (3D)</span>
                                      <select
                                        value={(data as ShapePart).parent || ""}
                                        onChange={(e) => updatePartParent(index, e.target.value)}
                                        className="bg-zinc-50 rounded px-1 py-0.5 text-[9px] border-none outline-none focus:ring-1 focus:ring-blue-500/20"
                                      >
                                        <option value="">Ninguno</option>
                                        {parts.filter((p, i) => i !== index).map((p, pIdx) => (
                                          <option key={`${p.tag}-${pIdx}`} value={p.tag}>{p.tag}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {activePanel === 'scene' && (
                    <div className="p-4 sm:p-5 space-y-4 sm:space-y-6">
                      <div className="space-y-4 sm:space-y-5">
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                          <div className="space-y-1.5 sm:space-y-2">
                            <label className="text-[8px] sm:text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Fondo</label>
                            <div className="flex items-center gap-2 sm:gap-3">
                              <input 
                                type="color" 
                                value={sceneSettings.backgroundColor}
                                onChange={(e) => setSceneSettings(prev => ({ ...prev, backgroundColor: e.target.value }))}
                                className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg border-none cursor-pointer"
                              />
                              <span className="text-[9px] sm:text-[10px] font-mono text-zinc-600 uppercase font-bold">{sceneSettings.backgroundColor}</span>
                            </div>
                          </div>
                          <div className="space-y-1.5 sm:space-y-2">
                            <label className="text-[8px] sm:text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Suelo</label>
                            <div className="flex items-center gap-2 sm:gap-3">
                              <input 
                                type="color" 
                                value={sceneSettings.floorColor}
                                onChange={(e) => setSceneSettings(prev => ({ ...prev, floorColor: e.target.value }))}
                                className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg border-none cursor-pointer"
                              />
                              <span className="text-[9px] sm:text-[10px] font-mono text-zinc-600 uppercase font-bold">{sceneSettings.floorColor}</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5 sm:space-y-2">
                          <label className="text-[8px] sm:text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Luz ({sceneSettings.lightIntensity.toFixed(1)})</label>
                          <input 
                            type="range" min="0" max="2" step="0.1"
                            value={sceneSettings.lightIntensity}
                            onChange={(e) => setSceneSettings(prev => ({ ...prev, lightIntensity: parseFloat(e.target.value) }))}
                            className="w-full h-1.5 bg-zinc-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                          />
                        </div>

                        <div className="space-y-1.5 sm:space-y-2">
                          <label className="text-[8px] sm:text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Material</label>
                          <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
                            {['standard', 'flat', 'wireframe'].map((type) => (
                              <button
                                key={type}
                                onClick={() => setSceneSettings(prev => ({ ...prev, materialType: type as any }))}
                                className={`py-1 sm:py-1.5 rounded-lg text-[7px] sm:text-[8px] font-bold uppercase transition-all border ${sceneSettings.materialType === type ? 'bg-blue-600 text-white border-blue-600' : 'bg-zinc-50 text-zinc-500 border-zinc-100 hover:bg-zinc-100'}`}
                              >
                                {type}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="pt-3 sm:pt-4 space-y-2 sm:space-y-3 border-t border-zinc-100">
                          <label className="flex items-center justify-between cursor-pointer group">
                            <span className="text-[8px] sm:text-[9px] font-bold text-zinc-600 uppercase tracking-wider">Luz Dramática</span>
                            <div className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={sceneSettings.dramaticLighting}
                                onChange={(e) => setSceneSettings(prev => ({ ...prev, dramaticLighting: e.target.checked }))}
                                className="sr-only peer"
                              />
                              <div className="w-7 h-3.5 sm:w-8 sm:h-4 bg-zinc-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-2.5 after:w-2.5 sm:after:h-3 sm:after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                            </div>
                          </label>
                          {[
                            { label: 'Cuadrícula', key: 'showGrid' },
                            { label: 'Suelo', key: 'showFloor' },
                            { label: 'Sombras', key: 'castShadows' }
                          ].map((toggle) => (
                            <label key={toggle.key} className="flex items-center justify-between cursor-pointer group">
                              <span className="text-[8px] sm:text-[9px] font-bold text-zinc-600 uppercase tracking-wider">{toggle.label}</span>
                              <div className="relative inline-flex items-center cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={(sceneSettings as any)[toggle.key]}
                                  onChange={(e) => setSceneSettings(prev => ({ ...prev, [toggle.key]: e.target.checked }))}
                                  className="sr-only peer"
                                />
                                <div className="w-7 h-3.5 sm:w-8 sm:h-4 bg-zinc-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-2.5 after:w-2.5 sm:after:h-3 sm:after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Viewer Info Overlay */}
          <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 flex flex-wrap items-center gap-3 sm:gap-6 text-[8px] sm:text-[10px] text-zinc-500 font-bold bg-white/90 backdrop-blur-md px-3 sm:px-4 py-2 rounded-2xl sm:rounded-full border border-zinc-200 shadow-lg z-20 max-w-[calc(100%-2rem)]">
            <span className="flex items-center gap-1 sm:gap-1.5 shrink-0"><ChevronRight size={10} className="sm:w-3 sm:h-3" /> Rotar</span>
            <span className="flex items-center gap-1 sm:gap-1.5 shrink-0"><ChevronRight size={10} className="sm:w-3 sm:h-3" /> Desplazar</span>
            <span className="flex items-center gap-1 sm:gap-1.5 shrink-0"><ChevronRight size={10} className="sm:w-3 sm:h-3" /> Zoom</span>
            {lastGenerationTime && (
              <span className="text-blue-600 sm:ml-2 sm:border-l border-zinc-200 sm:pl-4 shrink-0">Última: {(lastGenerationTime / 1000).toFixed(2)}s</span>
            )}
          </div>
        </div>

        {/* 3. Gallery Section */}
        <div id="gallery-section" className="space-y-6 px-4 sm:px-0">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3 text-zinc-800">
              <History size={20} className="text-blue-600 sm:w-6 sm:h-6" />
              <h3 className="text-base sm:text-lg font-bold tracking-tight">Tu Galería</h3>
            </div>
            <span className="px-3 py-1 bg-zinc-100 rounded-full text-[8px] sm:text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{savedModels.length} Guardados</span>
          </div>
          
          {savedModels.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-zinc-200 rounded-3xl p-12 text-center space-y-4">
              <Box size={48} className="mx-auto text-zinc-200" />
              <p className="text-sm text-zinc-400 font-medium">Aún no has guardado ningún modelo. ¡Genera algo increíble!</p>
            </div>
          ) : (
            <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {savedModels.slice((galleryPage - 1) * itemsPerPage, galleryPage * itemsPerPage).map((model) => (
                  <div
                    key={model.id}
                    onClick={() => loadFromGallery(model)}
                    className="group relative bg-white border border-zinc-200 rounded-2xl p-0 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/5 transition-all cursor-pointer overflow-hidden flex flex-col"
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square w-full bg-zinc-50 relative overflow-hidden border-b border-zinc-100">
                      {model.thumbnail ? (
                        <img 
                          src={model.thumbnail} 
                          alt={model.name} 
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-200">
                          <Box size={40} />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>

                    <div className="p-3 space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="space-y-0.5 min-w-0">
                          <h4 className="text-xs font-bold text-zinc-800 truncate group-hover:text-blue-600 transition-colors">
                            {model.name}
                          </h4>
                          <p className="text-[8px] text-zinc-400 font-medium uppercase tracking-wider">
                            {new Date(model.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteFromGallery(model.id, e);
                            }}
                            className="p-1 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 size={12} />
                          </button>
                          <span className="text-[7px] font-bold text-zinc-400 uppercase whitespace-nowrap">{model.parts.length} Pzs</span>
                        </div>
                      </div>
                      
                      <p className="text-[9px] text-zinc-500 line-clamp-2 italic leading-tight">
                        "{model.prompt}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination Controls */}
              {savedModels.length > itemsPerPage && (
                <div className="flex items-center justify-center gap-4">
                  <button
                    disabled={galleryPage === 1}
                    onClick={() => {
                      setGalleryPage(prev => prev - 1);
                      document.getElementById('gallery-section')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="p-2 bg-white border border-zinc-200 rounded-xl text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                    Página {galleryPage} de {Math.ceil(savedModels.length / itemsPerPage)}
                  </span>
                  <button
                    disabled={galleryPage === Math.ceil(savedModels.length / itemsPerPage)}
                    onClick={() => {
                      setGalleryPage(prev => prev + 1);
                      document.getElementById('gallery-section')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="p-2 bg-white border border-zinc-200 rounded-xl text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 4. Suggestions Section */}
        <div className="grid grid-cols-1 gap-6 sm:gap-8">
          {/* AI Suggestion Card */}
          <AnimatePresence>
            {hasGenerated && suggestions.length > 0 && !pendingAction && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 sm:p-8 rounded-3xl text-white shadow-2xl shadow-blue-500/20 space-y-6 relative overflow-hidden mx-4 sm:mx-0"
              >
                <div className="absolute top-0 right-0 p-12 opacity-10 transform translate-x-1/4 -translate-y-1/4">
                  <Sparkles size={160} />
                </div>
                <div className="relative space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md">
                      <Sparkles size={18} className="sm:w-5 sm:h-5" />
                    </div>
                    <span className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] opacity-80">Mejoras Inteligentes</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold leading-tight">
                    Sugerencias de Gemini
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                    {[...suggestions]
                      .sort((a, b) => (b.consciousnessScore || 0) - (a.consciousnessScore || 0))
                      .map((s, i) => {
                        const text = typeof s === 'string' ? s : s.text;
                        const score = typeof s === 'string' ? 0 : s.consciousnessScore;
                        
                        return (
                          <div
                            key={i}
                            className="w-full p-4 bg-white/10 border border-white/10 rounded-2xl transition-all flex flex-col gap-3"
                          >
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-medium leading-tight">"{text}"</span>
                                <div className="flex items-center gap-1">
                                  {[...Array(5)].map((_, starIdx) => (
                                    <Sparkles 
                                      key={starIdx} 
                                      size={10} 
                                      className={starIdx < score ? "text-amber-400 fill-amber-400" : "text-white/20"} 
                                      />
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleGenerateRequest(undefined, text)}
                                disabled={isLoading}
                                className="flex-1 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                              >
                                <Settings2 size={12} />
                                Editar
                              </button>
                              <button
                                onClick={() => startGeneration(text)}
                                disabled={isLoading}
                                className="flex-1 py-2 bg-white text-blue-600 hover:bg-blue-50 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                              >
                                <Send size={12} />
                                Aplicar
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 5. Prompt / Input Section (Moved back to Bottom) */}
        <div ref={generatorRef} className="max-w-4xl mx-auto w-full px-4 sm:px-0">
          <div className="bg-white p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border border-zinc-200 shadow-2xl space-y-6 relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-600 rounded-xl sm:rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                  <Sparkles size={18} className="sm:w-5 sm:h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold tracking-tight">
                    {hasGenerated ? 'Refinar Modelo' : 'Crear Nuevo Objeto'}
                  </h2>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] sm:text-xs text-zinc-400 font-medium">Describe lo que tienes en mente con</p>
                    <select 
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="text-[9px] sm:text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border-none outline-none cursor-pointer hover:bg-blue-100 transition-colors"
                    >
                      <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                      <option value="gemini-flash-latest">Gemini 1.5 Flash</option>
                      <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite</option>
                    </select>
                  </div>
                </div>
              </div>

              {showDebug && (
                <button 
                  onClick={() => setDebugLogs([])}
                  className="text-[10px] font-bold text-zinc-400 hover:text-red-500 uppercase tracking-widest transition-colors"
                >
                  Limpiar Consola
                </button>
              )}
            </div>
            
            <form onSubmit={(e) => handleGenerateRequest(e)} className="space-y-4 sm:space-y-6">
              <div className="relative group">
                <textarea
                  ref={promptRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={hasGenerated 
                    ? "Ej: 'Añade pies articulados al robot', 'Cambia el color a rojo metálico'..." 
                    : "Ej: 'Un robot explorador con antenas y ruedas', 'Un castillo medieval'..."}
                  className="w-full h-32 sm:h-40 p-4 sm:p-6 bg-zinc-50 border-2 border-zinc-100 rounded-2xl sm:rounded-3xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all resize-none text-sm sm:text-base leading-relaxed group-hover:border-zinc-200"
                />
                <div className="absolute bottom-3 right-4 text-[8px] sm:text-[10px] font-bold text-zinc-300 uppercase tracking-widest">
                  Gemini 3.1 Pro
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <button
                  type="submit"
                  disabled={isLoading || !prompt.trim()}
                  className="flex-[2] py-4 sm:py-5 bg-blue-600 text-white rounded-xl sm:rounded-2xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-500/20 text-base sm:text-lg"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={20} className="animate-spin sm:w-6 sm:h-6" />
                      {hasGenerated ? 'Actualizando...' : 'Esculpiendo...'}
                    </>
                  ) : (
                    <>
                      {hasGenerated ? <Sparkles size={20} className="sm:w-6 sm:h-6" /> : <Send size={20} className="sm:w-6 sm:h-6" />}
                      {hasGenerated ? 'Aplicar Cambios' : 'Generar Modelo 3D'}
                    </>
                  )}
                </button>
                
                {hasGenerated && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="flex-1 py-4 sm:py-5 bg-zinc-100 text-zinc-600 rounded-xl sm:rounded-2xl font-bold hover:bg-zinc-200 transition-all text-base sm:text-lg"
                  >
                    Nuevo
                  </button>
                )}
              </div>
            </form>

            {/* Quick Ideas - Moved here */}
            <div className="pt-4 space-y-3">
              <h3 className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest px-1">
                {hasGenerated ? 'Ideas de Modificación' : 'Inspiración Inicial'}
              </h3>
              <div className="flex flex-wrap gap-2">
                {(hasGenerated 
                  ? [
                      "Texturas de óxido", 
                      "Estilo Cyberpunk", 
                      "Forma biomórfica", 
                      "Componentes internos", 
                      "Efectos de energía",
                      "Inscripciones rúnicas",
                      "Estilo Pixar",
                      "Base escénica",
                      "Reliquia antigua",
                      "Cables expuestos"
                    ]
                  : [
                      "Mecha de combate", 
                      "Templo flotante", 
                      "Criatura marina", 
                      "Coche deportivo", 
                      "Ajedrez fantasía",
                      "Armadura samurái",
                      "Portal de piedra",
                      "Microscopio latón",
                      "Ciudad botella",
                      "Dragón de vapor"
                    ]
                ).map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setPrompt(ex)}
                    className="px-3 py-1.5 bg-zinc-50 border border-zinc-100 rounded-full text-[9px] font-bold hover:border-blue-500 hover:bg-blue-50 transition-all text-zinc-500 hover:text-blue-700 shadow-sm whitespace-nowrap"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            {/* Quota Confirmation Overlay */}
            <AnimatePresence>
              {pendingAction && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-[2rem] sm:rounded-[2.5rem] z-30 flex flex-col items-center justify-center p-6 sm:p-12 text-center space-y-4 sm:space-y-6"
                  >
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center">
                      <Info size={24} className="sm:w-8 sm:h-8" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg sm:text-xl font-bold text-zinc-800">¿Confirmar Generación?</h3>
                      <p className="text-xs sm:text-sm text-zinc-500 max-w-xs mx-auto">
                        Esta acción consumirá cuota de la API de Gemini para procesar tu solicitud.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full max-w-sm">
                      <button
                        onClick={() => startGeneration(pendingAction.prompt)}
                        className="flex-1 py-3 sm:py-4 bg-amber-600 text-white rounded-xl sm:rounded-2xl font-bold hover:bg-amber-700 transition-all shadow-lg shadow-amber-600/20 text-sm sm:text-base"
                      >
                        Sí, Generar
                      </button>
                      <button
                        onClick={() => setPendingAction(null)}
                        className="flex-1 py-3 sm:py-4 bg-zinc-100 text-zinc-600 rounded-xl sm:rounded-2xl font-bold hover:bg-zinc-200 transition-all text-sm sm:text-base"
                      >
                        Cancelar
                      </button>
                    </div>
                  </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Debug Console at the very bottom */}
        {showDebug && (
          <motion.div 
            ref={debugRef}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-8 bg-zinc-900 text-zinc-400 p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-zinc-800 font-mono text-[9px] sm:text-[11px] space-y-2 sm:space-y-3 max-h-60 sm:max-h-80 overflow-y-auto shadow-2xl custom-scrollbar mx-4 sm:mx-0"
          >
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3 mb-3">
              <span className="text-zinc-500 font-bold uppercase tracking-widest">Consola de Depuración</span>
              <span className="text-[9px] opacity-50">Gemini API Stream</span>
            </div>
            {debugLogs.length === 0 ? (
              <div className="italic opacity-30">Esperando eventos...</div>
            ) : (
              debugLogs.map((log, i) => (
                <div key={i} className="leading-relaxed border-l-2 border-zinc-800 pl-3 py-1 hover:bg-white/5 transition-colors">
                  {log}
                </div>
              ))
            )}
          </motion.div>
        )}

      </main>
      {/* Animation Stage Modal */}
      <AnimationStage 
        isOpen={isAnimationStageOpen}
        onClose={() => setIsAnimationStageOpen(false)}
        parts={parts}
        folders={folders}
        activeSkills={activeSkills}
        onToggleSkill={toggleSkill}
        settings={animationStageSettings}
        onUpdateSettings={setAnimationStageSettings}
      />
    </div>
    </ErrorBoundary>
  );
}
