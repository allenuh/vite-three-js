import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import CannonDebugger from 'cannon-es-debugger';
import Stats from 'three/examples/jsm/libs/stats.module.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'; // need to add PointerLockControls.js in the cannon-es folder
import { PointerLockControlsCannon } from './PointerLockControlsCannon.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

import {cubeSpiral} from './geometry.js';

const device = {
  width: window.innerWidth,
  height: window.innerHeight,
  pixelRatio: window.devicePixelRatio,
};

export default class Three {
  constructor(canvas) {

// three.js variables
let camera, scene, renderer, stats, gltfLoader, composer;
let material;
let floor;
let sphereMesh, boxMesh;
let gui, params;
let raycaster, pointer, isShiftDown = false;
const objects = [];

// GLTF variables
let model = new THREE.Object3D(); // Placeholder
let animationsMap = new Map();
let skeleton, mixer, clock, characterControls;

let idleAction, walkAction, runAction;
let idleWeight, walkWeight, runWeight;
let actions, settings;

let singleStepMode = false;
let sizeOfNextStep = 0;

// cannon.js variables
let world
let controls
let orbitControls
const timeStep = 1 / 60
let lastCallTime = performance.now() / 1000
let sphereShape
let sphereBody
let boxShape
let halfExtents
let boxBody
let playerHitboxBody
let physicsMaterial

const instructions = document.getElementById('instructions')
const crosshair = document.getElementById('crosshair')

initThree();
initCannon();

// Initialize the debugger after the Cannon world is created
const cannonDebugger = new CannonDebugger(scene, world); 

var loadTime = window.performance.timing.domContentLoadedEventEnd- window.performance.timing.navigationStart;
console.log(loadTime);
animate();

function initThree() {
  // Camera
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
  // camera = new THREE.PerspectiveCamera(75, device.width / device.height, 1, 100);

  // Scene
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x111111, 800, 1000)

  // Renderer
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(device.width, device.height);
  renderer.setClearColor(scene.fog.color);

  // Composer
  composer = new EffectComposer( renderer );
  const renderPixelatedPass = new RenderPixelatedPass( 1, scene, camera );
  composer.addPass( renderPixelatedPass );

  const outputPass = new OutputPass();
  composer.addPass( outputPass );

  // Stats
  stats = new Stats();
  stats.showPanel( 0 );  // 0: fps, 1: ms, 2: mb, 3+: custom
  document.body.appendChild( stats.dom );

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
  scene.add(ambientLight)

  const spotlight = new THREE.SpotLight(0xffffff, 900.0, 0, Math.PI / 4, 1)
  spotlight.position.set(0, 40, 0)
  spotlight.target.position.set(0, 0, -10)

  spotlight.castShadow = true

  spotlight.shadow.camera.near = 20
  spotlight.shadow.camera.far = 50
  spotlight.shadow.camera.fov = 50

  // spotlight.shadow.bias = -0.001
  spotlight.shadow.mapSize.width = 2048
  spotlight.shadow.mapSize.height = 2048

  scene.add(spotlight)

  // Raycaster & Pointer
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  // Generic material
  material = new THREE.MeshLambertMaterial({ color: 0x333333 })

  // Floor
  const floorGeometry = new THREE.PlaneGeometry(300, 300, 100, 100)
  floorGeometry.rotateX(-Math.PI / 2)
  const floor = new THREE.Mesh(floorGeometry, material)
  floor.receiveShadow = true
  scene.add(floor)

  // Clock
  clock = new THREE.Clock();

  // GLTF Loader
  gltfLoader = new GLTFLoader();

  // Player Model
  gltfLoader.load('/src/assets/models/Skeleton.glb', function (gltfModel) {
    model = gltfModel.scene;
    model.traverse(function (object) {
      if (object.isMesh) object.castShadow = true;
    });
    scene.add(model);

    const gltfAnimations = gltfModel.animations;
    mixer = new THREE.AnimationMixer(model);
    
    gltfAnimations.filter(a => a.name != 'TPose').forEach((a) => {
      animationsMap.set(a.name, mixer.clipAction(a));
    })
    initPointerLock();
  });

  // Museum Scene
  // gltfLoader.load('/src/assets/models/Museum.glb', (gltfScene) => {
  //   gltfScene.scene.position.set(-40, 0, -10)
  //   scene.add(gltfScene.scene)
  // })

  // GUI
  gui = new GUI();
  params = { pixelSize: 1, normalEdgeStrength: 1.3, depthEdgeStrength: .8, pixelAlignedPanning: true };
  gui.add( params, 'pixelSize' ).min( 1 ).max( 16 ).step( 1 )
    .onChange( () => {

      renderPixelatedPass.setPixelSize( params.pixelSize );

    } );
  gui.add( renderPixelatedPass, 'normalEdgeStrength' ).min( 0 ).max( 2 ).step( .05 );
  gui.add( renderPixelatedPass, 'depthEdgeStrength' ).min( 0 ).max( 1 ).step( .05 );
  gui.add( params, 'pixelAlignedPanning' );

  // // fuckass stupid cubes
  // let gridSize = 5;
  // let Yspacing = 2;
  // let spacing = 15;
  // for (let i = 0; i < gridSize; i++) {
  //   for (let j = 0; j < gridSize; j++) {
  //       for (let k = 0; k < 10; k++){
  //         var colorRand = "#" + ((1 << 24) * Math.random() | 0).toString(16).padStart(6, "0")
  //         const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: colorRand }));
  //         cube.position.set((i - 1) * spacing  + Math.floor(Math.random() * 13), k * Yspacing + 0.5, (j - 1) * spacing + Math.floor(Math.random() * 13));
  //         objects.push(cube);
  //         scene.add(cube);
  //     }
  //   }
  // }

  let turns = 10;
  cubeSpiral(scene, objects, turns);

  // pointerlock cube
  for (let i = 0; i < 1; i++){
    var colorRand = "#" + ((1 << 24) * Math.random() | 0).toString(16).padStart(6, "0")
    const cube = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5), new THREE.MeshStandardMaterial({ color: 0x00FFFFF }));
    cube.position.set(0, 10, 0);
    cube.name = "skibidifortnite";
    objects.push(cube);
    scene.add(cube);
  }

  let textureLoader = new THREE.TextureLoader();

  textureLoader.load("/src/assets/images/kloofendal_48d_partly_cloudy_puresky.jpg", (jpgTexture) => {
    let skySphereGeometry = new THREE.SphereGeometry(500, 60, 60);
    let skySphereMaterial = new THREE.MeshBasicMaterial({
      map: jpgTexture
    });

    skySphereMaterial.side = THREE.BackSide;
    let skySphereMesh = new THREE.Mesh(skySphereGeometry, skySphereMaterial);

    scene.add(skySphereMesh);
  },
  undefined,
  (error) => {
    console.error("Error loading texture:", error);
  })

  // EventListeners
  window.addEventListener('resize', onWindowResize);
  // window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('mousedown', onDocumentKeyDown);
  window.addEventListener('mouseup', onDocumentKeyUp);
}

// Resize window
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize( window.innerWidth, window.innerHeight );
}

function animate() {
  let mixerUpdateDelta = clock.getDelta();

  if (controls){
    controls.update(mixerUpdateDelta);
  }
  
  world.step(timeStep); // Step the physics world, Fixed time step of 60 Hz
  
  cannonDebugger.update(); // Cannon debugger
  
  renderer.render(scene, camera); // Render renderer three.js
  composer.render(); // Render composer
  
  stats.update(); // Stats

  requestAnimationFrame(animate);
}

function initCannon() {
  // Physics world
  world = new CANNON.World();
  world.gravity.set(0, -8.5, 0); // m/s²

  world.broadphase.useBoundingBoxes = true

  // Tweak contact properties.
  // Contact stiffness - use to make softer/harder contacts
  world.defaultContactMaterial.contactEquationStiffness = 1e9;

  // Stabilization time in number of timesteps
  world.defaultContactMaterial.contactEquationRelaxation = 4

  // Solver
  const solver = new CANNON.GSSolver()
  solver.iterations = 7
  solver.tolerance = 0.1
  world.solver = new CANNON.SplitSolver(solver)
  // use this to test non-split solver
  // world.solver = solver

  // Create a slippery material (friction coefficient = 0.0)
  physicsMaterial = new CANNON.Material('physics')
  const physics_physics = new CANNON.ContactMaterial(physicsMaterial, physicsMaterial, {
    friction: 0.0,
    restitution: 0.0, 
  })

  // We must add the contact materials to the world
  world.addContactMaterial(physics_physics)

  // Create the ground plane
  const groundShape = new CANNON.Plane()
  const groundBody = new CANNON.Body({ mass: 0, material: physics_physics })
  groundBody.addShape(groundShape)
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
  world.addBody(groundBody)

  // Create the user collision hitbox
  halfExtents = new CANNON.Vec3(0.2, 0.8, 0.2)
  boxShape = new CANNON.Box(halfExtents)
  playerHitboxBody = new CANNON.Body({ mass: 5, material: physicsMaterial, shape: boxShape })
  playerHitboxBody.position.set(0, 2, 0)
  playerHitboxBody.linearDamping = 0.8
  world.addBody(playerHitboxBody)
}

function initPointerLock() {
  controls = new PointerLockControlsCannon(camera, playerHitboxBody, model, mixer, 'Idle', animationsMap)
  scene.add(controls.getObject())

  instructions.addEventListener('click', () => {
    controls.lock()
  })

  controls.addEventListener('lock', () => {
    controls.enabled = true
    instructions.style.display = 'none'
    crosshair.style.display = null
  })

  controls.addEventListener('unlock', () => {
    controls.enabled = false
    instructions.style.display = null
    crosshair.style.display = 'none'
  })
}

function onPointerMove( event ) {

  pointer.set(0, 0); // set pointer to center of screen, like as a crosshair
  
  raycaster.setFromCamera( pointer, camera );

  const intersects = raycaster.intersectObjects( objects, false );
  
  if ( intersects.length > 0 ) {

    console.log(intersects[0]);

  }
}

function onPointerDown( event ) {

  pointer.set(0, 0)

  raycaster.setFromCamera( pointer, camera );

  const intersects = raycaster.intersectObjects( objects, false );

  if ( intersects.length > 0 ) {

    const intersect = intersects[0];

    if (intersect.object.name === "skibidifortnite"){
      controls.unlock();
    }

    intersect.object.material.color.set(0xffffff);

  }
}

  
function onDocumentKeyDown( event ) {

  switch ( event.keyCode ) {

    case 16: isShiftDown = true; break;

  }

}

function onDocumentKeyUp( event ) {

  switch ( event.keyCode ) {

    case 16: isShiftDown = false; break;

  }

}

// End constructor
  }
}