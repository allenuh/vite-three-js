import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import CannonDebugger from 'cannon-es-debugger';
import Stats from 'three/examples/jsm/libs/stats.module.js';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'; // need to add PointerLockControls.js in the cannon-es folder
import { PointerLockControlsCannon } from './PointerLockControlsCannon.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { getParticleSystem } from './getParticleSystem.js';
import { threeToCannon, ShapeType } from 'three-to-cannon';

import {cubeSpiral} from './geometry.js';

const device = {
    width: window.innerWidth,
    height: window.innerHeight,
    pixelRatio: window.devicePixelRatio,
};

export default class Three {
    constructor(canvas) {

// three.js variables
let camera, fov, scene, renderer, stats, gltfLoader, composer;
let material;
let parent, emitter;
let floor;
let terrain = null;
let sphereMesh, boxMesh;
let gui, params;
let raycaster, pointer;
let textureLoader;
const objects = [];
let smokeEffect = null;

// GLTF variables
var model = null;
var mixer = null;
let animationsMap = new Map();
let clock;

// cannon.js variables
let world
let cannonDebugger
let controls
const timeStep = 1 / 60
let lastCallTime = performance.now() / 1000
let boxShape
let halfExtents
let playerHitboxBody
let physicsMaterial

const instructions = document.getElementById('instructions')
const crosshair = document.getElementById('crosshair')

init();

async function init() {
    await initThree();
    await initCannon();
    initPointerLock(); // nothing needs to be waited for in initPointerLock();
    animate();
}

async function initThree() {
    // Camera
    fov = 70;
    camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.1, 1000)
    // camera = new THREE.PerspectiveCamera(75, device.width / device.height, 1, 100);

    // Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x222222, 512 , 1000)

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

    initLights();
    
    // Raycaster & Pointer
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    // Texture Loader
    textureLoader = new THREE.TextureLoader();

    // Generic material
    material = new THREE.MeshLambertMaterial({ color: 0x333333 })

    // Clock
    clock = new THREE.Clock();

    // GLTF Loader
    gltfLoader = new GLTFLoader();

    // Load Terrain
    await loadTerrain();

    // Load Player Model
    await loadPlayerModel();

    // Load Particle Effects
    // await loadParticleSystem();
    
    // Museum Scene
    // gltfLoader.load('/src/assets/models/Museum.glb', (gltfScene) => {
    //   gltfScene.scene.position.set(-40, 0, -10)
    //   scene.add(gltfScene.scene)
    // })

    // GUI
    gui = new GUI();
    params = { pixelSize: 6, normalEdgeStrength: 1.3, depthEdgeStrength: .8, pixelAlignedPanning: true };
    gui.add( params, 'pixelSize' ).min( 1 ).max( 16 ).step( 1 ).onChange( () => {
        renderPixelatedPass.setPixelSize( params.pixelSize );
        } );
    gui.add( renderPixelatedPass, 'normalEdgeStrength' ).min( 0 ).max( 2 ).step( .05 );
    gui.add( renderPixelatedPass, 'depthEdgeStrength' ).min( 0 ).max( 1 ).step( .05 );
    gui.add( params, 'pixelAlignedPanning' );

    initTextureLoader();

    // EventListeners
    window.addEventListener('resize', onWindowResize);
    // window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('mousedown', onDocumentKeyDown);
    window.addEventListener('mouseup', onDocumentKeyUp);
}

async function initCannon() {
    // Physics world
    world = new CANNON.World();
    world.gravity.set(0, -9.8, 0); // m/s²

    world.broadphase.useBoundingBoxes = true

    // Tweak contact properties.
    // Contact stiffness - use to make softer/harder contacts
    // world.defaultContactMaterial.contactEquationStiffness = 1e9;

    // Stabilization time in number of timesteps
    // world.defaultContactMaterial.contactEquationRelaxation = 41

    // Initialize the debugger after the Cannon world is created
    cannonDebugger = new CannonDebugger(scene, world); 

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
    const groundBody = new CANNON.Body({ mass: 0, material: physics_physics });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
    world.addBody(groundBody);

    // Create the user collision hitbox
    halfExtents = new CANNON.Vec3(0.2, 0.8, 0.2)
    boxShape = new CANNON.Box(halfExtents)
    playerHitboxBody = new CANNON.Body({ mass: 5, material: physicsMaterial, shape: boxShape })
    playerHitboxBody.position.set(0, 2, 0)
    playerHitboxBody.linearDamping = 0.8
    world.addBody(playerHitboxBody)

    // cube arhcimedian spiral
    let turns = 2;
    cubeSpiral(scene, world, objects, turns);
}

function animate() {
    world.step(timeStep); // Step the physics world, Fixed time step of 60 Hz
    
    let mixerUpdateDelta = clock.getDelta();

    if (controls){
        controls.update(mixerUpdateDelta);
    }

    // Sync Three.js cubes with Cannon.js physics
    objects.forEach(({ mesh, body }) => {
        mesh.position.copy(body.position);
        mesh.quaternion.copy(body.quaternion);
    });

    if (smokeEffect != null){
        smokeEffect.update(0.016);
    }
    
    cannonDebugger.update(); // Cannon debugger
    renderer.render(scene, camera); // Render renderer three.js
    composer.render(); // Render composer
    stats.update(); // Stats

    requestAnimationFrame(animate);
}

// Resize window
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize( window.innerWidth, window.innerHeight );
}

function initLights(){
    // ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
    scene.add(ambientLight);

    // spotlights
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

    scene.add(spotlight);
}

async function loadPlayerModel() {
    const gltf = await new Promise((resolve, reject) => {
        gltfLoader.load('/src/assets/models/Skeleton.glb', resolve, undefined, reject);
    });

    model = gltf.scene;
    model.traverse((object) => {
        if (object.isMesh) object.castShadow = true;
    });
    scene.add(model);

    const gltfAnimations = gltf.animations;

    mixer = new THREE.AnimationMixer(model);
    
    gltfAnimations.filter(a => a.name !== 'TPose').forEach((a) => {
        animationsMap.set(a.name, mixer.clipAction(a));
    });
}

async function loadParticleSystem(){
    smokeEffect = getParticleSystem({
        camera,
        emitter: model,
        parent: scene,
        rate: 200,
        texture: '/src/assets/images/green_fire.png',
        offsetY: 1.4,
    });
}

async function loadTerrain(){
    const gltf = await new Promise((resolve, reject) => {
        gltfLoader.load('/src/assets/models/terrain.glb', resolve, undefined, reject);
    });
        
    terrain = gltf.scene;
    let texture = textureLoader.load('/src/assets/images/PSX_Seamless_ForestWildGround_128px.png');

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 10);

    let terrainMaterial = new THREE.MeshBasicMaterial({
        map: texture
    })
    
    // Apply the texture to all meshes in the GLTF model
    terrain.traverse((child) => {
        if (child.isMesh) {
            child.material = terrainMaterial;
            child.material.needsUpdate = true;
        }
    });
    terrain.receiveShadow = true;

    scene.add(terrain);
}

function initTextureLoader(){
    // Sky
    textureLoader.load("/src/assets/images/clear_sky.jpg", (jpgTexture) => {
        jpgTexture.colorSpace = THREE.SRGBColorSpace;
        let skySphereGeometry = new THREE.SphereGeometry(256, 60, 60);
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
    });

    // Floor
    textureLoader.load("/src/assets/images/PSX_Seamless_ForestWildGround_128px.png", (pngTexture) => {
        let floorGeometry = new THREE.PlaneGeometry(256, 256, 100, 100)
        floorGeometry.rotateX(-Math.PI / 2)
    
        pngTexture.colorSpace = THREE.SRGBColorSpace;
        pngTexture.wrapS = THREE.RepeatWrapping;
        pngTexture.wrapT = THREE.RepeatWrapping;
        pngTexture.repeat.set(64,64);

        let floorMaterial = new THREE.MeshBasicMaterial({
            map: pngTexture
        });

        let floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);

        floorMesh.receiveShadow = true;
        scene.add(floorMesh);
    },
    undefined,
    (error) => {
        console.error("Error loading texture:", error);
    });
}

async function initPointerLock() {

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

    const intersects = raycaster.intersectObjects(scene.children, false);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        const clickedObject = intersect.object;

        // console.log("Clicked Object Name:", clickedObject.name);
        // console.log("Clicked Object Color:", clickedObject.material.color.getHexString());

        // Change the color of the clicked object
        clickedObject.material.color.set(0xffffff);
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

// End Constructor
}
// End Class
}
