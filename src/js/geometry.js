import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export function cubeSpiral(scene, world, objects, turns, s = 4) { 
    let a = 3;  // Initial radius
    let b = 2;  // Spiral growth factor
    let theta = 0;  // Start angle

    let r = a + b * theta; // Initial radius

    while (theta < turns * 2 * Math.PI) {
        let x = r * Math.cos(theta);
        let y = r * Math.sin(theta);

        // Generate random color
        // let colorRand = "#" + ((1 << 24) * Math.random() | 0).toString(16).padStart(6, "0");

        let colorRand = 0x143112;

        // Create Cannon.js body
        const shape = new CANNON.Box(new CANNON.Vec3(1, 0.25, 1));
        const body = new CANNON.Body({
            mass: 0,  
            shape: shape,
            position: new CANNON.Vec3(x, theta * 1 + 1, y)
        });
        world.addBody(body);

        // Create Three.js cube
        const cube = new THREE.Mesh(
            new THREE.BoxGeometry(2, 0.5, 2),
            new THREE.MeshStandardMaterial({ color: colorRand })
        );

        cube.position.set(x, theta * 1 + 1, y);
        cube.name = `cube_${objects.length}`; // Assign a unique name
        scene.add(cube);

        // Store references
        objects.push({ mesh: cube, body: body });

        let dTheta = s / Math.sqrt(b * b + r * r);
        theta += dTheta;
        r = a + b * theta;
    }
}



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