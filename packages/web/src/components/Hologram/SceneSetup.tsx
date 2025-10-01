import * as THREE from 'three';
import { useEffect, useRef } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

export default function HologramScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    
    // Lighting for hologram effect
    const ambientLight = new THREE.AmbientLight(0x404040);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    const pointLight = new THREE.PointLight(0x44ff88, 1, 100);
    
    // Scene configuration
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (mountRef.current) {
      mountRef.current.appendChild(renderer.domElement);
    }

    // Load hologram model
    const loader = new GLTFLoader();
    loader.load(
      '/models/hologram-avatar.glb',
      (gltf) => {
        const model = gltf.scene;
        // Configure materials for holographic look
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = new THREE.MeshPhongMaterial({
              color: 0x44ff88,
              transparent: true,
              opacity: 0.8,
              specular: 0x111111,
              shininess: 30
            });
          }
        });
        scene.add(model);
      },
      undefined,
      (error) => console.error('Error loading hologram:', error)
    );

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (mountRef.current && mountRef.current.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
}