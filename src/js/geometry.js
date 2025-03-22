import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export function cubeSpiral(scene, objects, turns){
    let a = 0;  // Controls initial radius
    let b = 2;  // Controls spacing between arms
    let step = 0.1;  // Angle step in radians

    for (let theta = 0; theta < turns* 2 * Math.PI; theta += step){
        let r = a + b * theta;
        let x = r * Math.cos(theta);
        let y = r * Math.sin(theta);

        var colorRand = "#" + ((1 << 24) * Math.random() | 0).toString(16).padStart(6, "0")
        const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: colorRand }));
        cube.position.set((x - 1), theta, (y - 1));
        objects.push(cube);
        scene.add(cube);
    }
}