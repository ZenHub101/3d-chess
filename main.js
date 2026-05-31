import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.165.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.165.0/examples/jsm/loaders/GLTFLoader.js';

// dom elements
const coordsInfo = document.getElementById("coords");
const turnInfo = document.getElementById("turn-text");
const toast = document.getElementById("toast");

// self-explanatory
class Piece {
  constructor(type, color) {
    this.type = type;
    this.color = color;
  }
}

// game variables
let board = Array(8).fill().map(() =>
  Array(8).fill().map(() =>
    Array(8).fill(null)
  )
);
let currentPlayer = 1; // 1 = white; 2 = black
const size = 8;
const selected = {
    file: 0,
    plane: 0,
    rank: 0
};
const cells = [];

// scene
const scene = new THREE.Scene();

// camera
const camera = new THREE.PerspectiveCamera(
    60, // FOV
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.z = 12;

// reusable materials and geometries
const geometry = new THREE.BoxGeometry(1, 1, 1);
const edges = new THREE.EdgesGeometry(geometry);

// renderer
const renderer = new THREE.WebGLRenderer({
    anitalias: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);
controls.minDistance = 5;
controls.maxDistance = 20;
controls.update();

// ambient light
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// directional light
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(12, 12, 12);
scene.add(directionalLight);

// board cells
for (let file = 0; file < size; file++) { // file = x axis
    cells[file] = [];
    for (let plane = 0; plane < size; plane++) { // plane = y axis
        cells[file][plane] = [];
        for (let rank = 0; rank < size; rank++) { // rank = z axis
            const isEven = (file + plane + rank) % 2 === 0;
            // materials
            const boxMaterial = new THREE.MeshStandardMaterial({
                color: 0xffff00,
                transparent: true,
                opacity: 0.01
            });
            const wireMaterial = isEven
              ? new THREE.LineBasicMaterial({ color: 0xe0f0ef, transparent: true, opacity: 0.5 })
              : new THREE.LineBasicMaterial({ color: 0x815438, transparent: true, opacity: 0.5 });
            
            const edges = new THREE.EdgesGeometry(geometry);
            const wire = new THREE.LineSegments(edges, wireMaterial);
            const box = new THREE.Mesh(geometry, boxMaterial);

            // references
            const cell = new THREE.Group();
            cell.userData.box = box;
            cell.userData.wire = wire;
            cell.userData.file = file;
            cell.userData.plane = plane;
            cell.userData.rank = rank;
            if (!board[file]) board[file] = [];
            if (!board[file][plane]) board[file][plane] = [];
            cells[file][plane][rank] = cell;

            // cell placement
            cell.position.x = (file - (size - 1) / 2);
            cell.position.y = -(plane - (size - 1) / 2);
            cell.position.z = -(rank - (size - 1) / 2);

            cell.add(box);
            cell.add(wire);
            box.userData.parentCell = cell;
            wire.userData.parentCell = cell;
            scene.add(cell);
        }
    }
}



// --- function definitions ---

// get/place pieces
function getPiece(x, y, z) {
  if (x < 0 || x > 7 || y < 0 || y > 7 || z < 0 || z > 7) return null;
  return board[x][y][z];
}
function setPiece(x, y, z, piece) {
  board[x][y][z] = piece;
}

// animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // reset opacity
    for (let f = 0; f < size; f++) {
        for (let p = 0; p < size; p++) {
            for (let r = 0; r < size; r++) {
                cells[f][p][r].userData.box.material.opacity = 0.01;
            }
        }
    }

    // highlight selected cell
    const selectedCell = cells[selected.file][selected.plane][selected.rank];
    selectedCell.userData.box.material.opacity = 0.5;
    renderer.render(scene, camera);
}

// --- animate stuff ---
animate();