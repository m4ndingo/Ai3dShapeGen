import * as THREE from 'three';

/**
 * ============================================================================
 * INSTRUCCIONES DE INTEGRACIÓN PARA AI STUDIO
 * ============================================================================
 * Arquitectura: Módulo de Animación Paramétrica Consciente.
 * * Este componente ha sido diseñado bajo principios de equilibrio estructural y 
 * geometría sagrada. Canaliza flujos de energía cinética (oscilaciones matemáticas) 
 * a través de matrices tridimensionales de forma paramétrica, prescindiendo de la 
 * necesidad de armaduras óseas tradicionales (rigging).
 */

export class AnimadorHolistico {
    private rootModel: THREE.Object3D;
    private localNodes: Record<string, THREE.Object3D> = {};
    private activeSkills: Set<string> = new Set();
    private elapsedTime: number = 0;

    /**
     * @param model La matriz tridimensional (GLTF.scene o THREE.Group) a animar.
     */
    constructor(model: THREE.Object3D) {
        this.rootModel = model;
        this.asimilarTopologia();
    }

    /**
     * Recorre la estructura fractal del modelo y registra su estado de reposo absoluto.
     */
    private asimilarTopologia(): void {
        this.localNodes = {};
        this.rootModel.traverse((child) => {
            // Guardamos la firma espacial original de cada nodo
            child.userData.basePosition = child.position.clone();
            child.userData.baseRotation = child.rotation.clone();
            child.userData.baseScale = child.scale.clone();
            
            // Indexamos el nodo si posee una nomenclatura definida (tag o name)
            const name = child.name || child.userData.tag;
            if (name) {
                this.localNodes[name] = child;
            }
        });
    }

    /**
     * Re-asimila la topología si el modelo cambia (ej. se añaden partes).
     */
    public refresh(): void {
        this.asimilarTopologia();
    }

    /**
     * Retorna información de depuración sobre los nodos identificados y las habilidades activas.
     */
    public getDebugInfo(): any {
        const skillTargets: Record<string, string[]> = {};
        const skills = ['parpadeo', 'brazos', 'colgados', 'caminar', 'vuelo', 'analisis', 'boca', 'suspension', 'faros', 'volante'];
        
        skills.forEach(skill => {
            const targets: string[] = [];
            let keywords: string[] = [];
            
            switch (skill) {
                case 'parpadeo': keywords = ['l_eye', 'left_eye', 'eye_l', 'r_eye', 'right_eye', 'eye_r']; break;
                case 'brazos': keywords = ['l_shoulder', 'left_shoulder', 'shoulder_l', 'arm_l', 'l_arm', 'r_shoulder', 'right_shoulder', 'shoulder_r', 'arm_r', 'r_arm']; break;
                case 'colgados': keywords = ['l_shoulder', 'r_shoulder', 'l_hip', 'r_hip']; break;
                case 'caminar': keywords = ['pelvis', 'torso', 'l_shoulder', 'r_shoulder', 'l_hip', 'r_hip', 'l_knee', 'r_knee']; break;
                case 'vuelo': keywords = ['pelvis', 'l_thruster', 'r_thruster']; break;
                case 'analisis': keywords = ['hologram', 'head', 'neck']; break;
                case 'boca': keywords = ['boca', 'mouth', 'jaw', 'mandibula', 'lips']; break;
                case 'suspension': keywords = ['body', 'chasis', 'chassis', 'cabin', 'frame']; break;
                case 'faros': keywords = ['faro', 'light', 'lamp', 'luz', 'luces', 'neon']; break;
                case 'volante': keywords = ['steer', 'volante', 'wheel_nav', 'timon']; break;
            }

            keywords.forEach(kw => {
                const found = this.getSemanticTarget([kw]);
                if (found) targets.push(`${kw} -> ${found.name || 'unnamed'}`);
            });
            skillTargets[skill] = targets;
        });

        return {
            activeSkills: Array.from(this.activeSkills),
            nodeCount: Object.keys(this.localNodes).length,
            nodes: Object.keys(this.localNodes),
            skillTargets
        };
    }

    /**
     * Activa o desactiva un flujo de movimiento específico.
     */
    public setSkillState(skillId: string, isActive: boolean): void {
        if (skillId === 'reposo') {
            this.activeSkills.clear();
            return;
        }

        if (isActive) {
            this.activeSkills.add(skillId);
        } else {
            this.activeSkills.delete(skillId);
        }
    }

    public getActiveSkills(): string[] {
        return Array.from(this.activeSkills);
    }

    /**
     * Resonancia Semántica: Busca un nodo por su "esencia".
     */
    private getSemanticTarget(keywords: string[]): THREE.Object3D | null {
        const keys = Object.keys(this.localNodes);
        
        // Normalización de keywords para búsqueda robusta
        const normalizedKeywords = keywords.map(kw => kw.toLowerCase());
        
        for (const kw of normalizedKeywords) {
            // 1. Coincidencia exacta o con prefijo pivot_
            let match = keys.find(k => {
                const kLower = k.toLowerCase();
                return kLower === kw || kLower === `pivot_${kw}`;
            });

            // 2. Búsqueda por inclusión si no hay exacta
            if (!match) {
                match = keys.find(k => {
                    const kLower = k.toLowerCase();
                    return kLower.includes(kw) || kw.includes(kLower);
                });
            }
            
            if (match) {
                // Priorizamos devolver el pivot si existe
                const pivotName = match.toLowerCase().startsWith('pivot_') ? match : `pivot_${match}`;
                return this.localNodes[pivotName] || this.localNodes[match];
            }
        }
        return null;
    }

    /**
     * Rastreador Colectivo: Localiza y agrupa todas las piezas que compartan la misma raíz vibracional.
     */
    private getSemanticGroup(keywords: string[]): THREE.Object3D[] {
        const result: THREE.Object3D[] = [];
        const keys = Object.keys(this.localNodes);
        keys.forEach(k => {
            const lowerK = k.toLowerCase();
            if (keywords.some(kw => lowerK.includes(kw))) {
                const baseKey = lowerK.startsWith('pivot_') ? k.substring(6) : k;
                const target = this.localNodes[`pivot_${baseKey}`] || this.localNodes[k];
                if (!result.includes(target)) result.push(target);
            }
        });
        return result;
    }

    private addSemanticRotation(keywords: string[], axis: 'x'|'y'|'z', baseValue: number, usePolarity: boolean = false): void {
        const target = this.getSemanticTarget(keywords);
        if (!target) return;

        let finalValue = baseValue;
        
        if (usePolarity) {
            const worldPosition = new THREE.Vector3();
            target.getWorldPosition(worldPosition);
            const localPosition = this.rootModel.worldToLocal(worldPosition);
            // Si está a la izquierda (x < 0), invertimos el valor para simetría
            const polaritySign = (localPosition.x >= 0) ? 1 : -1;
            finalValue = baseValue * polaritySign;
        }

        target.rotation[axis] += finalValue;
    }

    private restoreEquilibrium(): void {
        Object.values(this.localNodes).forEach(node => {
            if (node.userData.baseRotation && node.userData.baseScale && node.userData.basePosition) {
                node.rotation.copy(node.userData.baseRotation);
                node.scale.copy(node.userData.baseScale);
                node.position.copy(node.userData.basePosition);
            }
        });
    }

    public update(delta: number): void {
        this.elapsedTime += delta;
        const time = this.elapsedTime;

        this.restoreEquilibrium();

        if (this.activeSkills.size === 0) return;

        this.activeSkills.forEach(skill => {
            switch (skill) {
                case 'parpadeo':
                    // Parpadeo más frecuente y rápido
                    const blink = (Math.sin(time * 8) > 0.9) ? 0.05 : 1.0;
                    const lEye = this.getSemanticTarget(['l_eye', 'left_eye', 'eye_l', 'ojo_izq']);
                    const rEye = this.getSemanticTarget(['r_eye', 'right_eye', 'eye_r', 'ojo_der']);
                    if (lEye) lEye.scale.y *= blink;
                    if (rEye) rEye.scale.y *= blink;
                    break;
                    
                case 'brazos':
                    // Movimiento de brazos más amplio
                    const armRaise = Math.sin(time * 2) * 1.2;
                    this.addSemanticRotation(['l_shoulder', 'left_shoulder', 'shoulder_l', 'arm_l', 'l_arm', 'brazo_izq'], 'z', armRaise, true);
                    this.addSemanticRotation(['r_shoulder', 'right_shoulder', 'shoulder_r', 'arm_r', 'r_arm', 'brazo_der'], 'z', armRaise, true);
                    break;
                    
                case 'colgados':
                    const hangOsc = Math.sin(time * 4);
                    this.addSemanticRotation(['l_shoulder', 'left_shoulder', 'shoulder_l', 'arm_l', 'l_arm'], 'x', hangOsc * 0.8);
                    this.addSemanticRotation(['r_shoulder', 'right_shoulder', 'shoulder_r', 'arm_r', 'r_arm'], 'x', hangOsc * 0.8);
                    this.addSemanticRotation(['l_hip', 'left_hip', 'hip_l', 'l_leg', 'leg_l', 'thigh_l', 'pierna_izq'], 'x', -hangOsc * 0.8);
                    this.addSemanticRotation(['r_hip', 'right_hip', 'hip_r', 'r_leg', 'leg_r', 'thigh_r', 'pierna_der'], 'x', -hangOsc * 0.8);
                    break;

                case 'caminar':
                    const walkFreq = 6;
                    const walkOsc = Math.sin(time * walkFreq);
                    const pelvis = this.getSemanticTarget(['pelvis', 'torso', 'chest', 'body', 'spine', 'core', 'cuerpo']);
                    if (pelvis && pelvis.userData.basePosition) {
                        // Rebote vertical
                        pelvis.position.y = pelvis.userData.basePosition.y + Math.abs(Math.cos(time * walkFreq)) * 0.08;
                    }
                    // Brazos alternos
                    this.addSemanticRotation(['l_shoulder', 'left_shoulder', 'shoulder_l', 'arm_l', 'l_arm'], 'x', walkOsc * 0.8);
                    this.addSemanticRotation(['r_shoulder', 'right_shoulder', 'shoulder_r', 'arm_r', 'r_arm'], 'x', -walkOsc * 0.8);
                    // Piernas alternas
                    this.addSemanticRotation(['l_hip', 'left_hip', 'hip_l', 'l_leg', 'leg_l', 'thigh_l'], 'x', -walkOsc * 0.9);
                    this.addSemanticRotation(['r_hip', 'right_hip', 'hip_r', 'r_leg', 'leg_r', 'thigh_r'], 'x', walkOsc * 0.9);
                    // Rodillas
                    this.addSemanticRotation(['l_knee', 'left_knee', 'knee_l'], 'x', Math.max(0, -walkOsc * 1.2));
                    this.addSemanticRotation(['r_knee', 'right_knee', 'knee_r'], 'x', Math.max(0, walkOsc * 1.2));
                    break;

                case 'vuelo':
                    // Inclinación hacia adelante
                    this.addSemanticRotation(['pelvis', 'torso', 'chest', 'body', 'spine', 'core'], 'x', 0.6);
                    const glow = 1 + Math.sin(time * 20) * 0.5;
                    const lThrust = this.getSemanticTarget(['l_thruster', 'thruster_l', 'propulsor_izq', 'jet_l']);
                    const rThrust = this.getSemanticTarget(['r_thruster', 'thruster_r', 'propulsor_der', 'jet_r']);
                    if (lThrust) { lThrust.scale.setScalar(lThrust.userData.baseScale.x * glow); }
                    if (rThrust) { rThrust.scale.setScalar(rThrust.userData.baseScale.x * glow); }
                    break;

                case 'analisis':
                    this.addSemanticRotation(['hologram', 'display', 'ai_', 'pantalla'], 'y', time * 4);
                    this.addSemanticRotation(['head', 'neck', 'cabeza', 'cuello'], 'y', Math.sin(time * 2) * 0.5);
                    this.addSemanticRotation(['head', 'neck', 'cabeza', 'cuello'], 'z', Math.cos(time * 1.5) * 0.2);
                    break;

                case 'boca':
                    // Resonancia Vocal: Expansión multidimensional de la cavidad fonadora
                    const vocalPhase = Math.abs(Math.sin(time * 6));
                    const bocaNode = this.getSemanticTarget(['boca', 'mouth', 'jaw', 'mandibula', 'lips']);
                    if (bocaNode) {
                        bocaNode.rotation.x -= vocalPhase * 0.4;
                        bocaNode.position.y -= vocalPhase * 0.05;
                        bocaNode.position.z += vocalPhase * 0.05;
                        bocaNode.scale.set(
                            bocaNode.userData.baseScale.x * (1 + vocalPhase * 0.2),
                            bocaNode.userData.baseScale.y * (1 + vocalPhase * 0.5),
                            bocaNode.userData.baseScale.z * (1 + vocalPhase * 0.2)
                        );
                    }
                    break;

                case 'suspension':
                    // Respiración de Chasis: Micro-oscilación vertical emulando transferencia de masa terrestre
                    const chasisNode = this.getSemanticTarget(['body', 'chasis', 'chassis', 'cabin', 'frame']);
                    if (chasisNode) {
                        chasisNode.position.y += Math.sin(time * 8) * 0.03;
                    }
                    break;

                case 'faros':
                    // Ráfaga Lumínica: Pulso expansivo en los focos de emisión lumínica
                    const luzPhase = (Math.sin(time * 8) > 0) ? 1.4 : 0.8;
                    const faros = this.getSemanticGroup(['faro', 'light', 'lamp', 'luz', 'luces', 'neon']);
                    faros.forEach(f => {
                        f.scale.set(
                            f.userData.baseScale.x * luzPhase,
                            f.userData.baseScale.y * luzPhase,
                            f.userData.baseScale.z * luzPhase
                        );
                    });
                    break;

                case 'volante':
                    // Navegación Autónoma: Vínculo cruzado entre el timón central y los estabilizadores frontales
                    const steerPhase = Math.sin(time * 2.5) * 0.8;
                    const volantes = this.getSemanticGroup(['steer', 'volante', 'wheel_nav', 'timon']);
                    volantes.forEach(v => v.rotation.z -= steerPhase);
                    
                    const llantas = this.getSemanticGroup(['wheel', 'rueda', 'tire', 'llanta']);
                    llantas.forEach(r => {
                        const wp = new THREE.Vector3();
                        r.getWorldPosition(wp);
                        const lp = this.rootModel.worldToLocal(wp);
                        // Aplicar direccionalidad únicamente a las entidades ubicadas en el hemicuerpo frontal (Z positivo)
                        if (lp.z > 0.1) {
                            r.rotation.y += steerPhase * 0.6;
                        }
                    });
                    
                    // Asegurar también la rotación perpetua en el eje sagital
                    llantas.forEach(r => r.rotation.x += time * 5);
                    break;
            }
        });
    }
}
