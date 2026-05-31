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
const backRankWhite = [
    "Rook",
    "Knight",
    "Bishop",
    "Queen",
    "King",
    "Bishop",
    "Knight",
    "Rook"
];

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

// loaders
const loader = new GLTFLoader();
let pawnModel;
let rookModel;
let knightModel;
let bishopModel;
let queenModel;
let kingModel;
loader.load(
    'assets/3D models/Pawn.glb',
    gltf => {
        rookModel = gltf.scene;
        console.log("rook loaded!");
    }
);

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
            cells[file][plane][rank] = cell;
            cells[file][plane][rank].userData.box = box;
            cells[file][plane][rank].userData.wire = wire;
            cell.userData.file = file;
            cell.userData.plane = plane;
            cell.userData.rank = rank;
            cells[file][plane][rank].userData.file = file;
            cells[file][plane][rank].userData.plane = plane;
            cells[file][plane][rank].userData.rank = rank;
            if (!board[file]) board[file] = [];
            if (!board[file][plane]) board[file][plane] = [];

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
function placePiece(file, plane, rank, piece, color) {
    board[file][plane][rank] = new Piece(piece, color);

    loader.load(
        `assets/3D models/${piece}.glb`,
        gltf => {
            gltf.scene.position.set(
                (file - (size - 1) / 2),
                -(plane - (size - 1) / 2) - 0.5,
                -(rank - (size - 1) / 2)
            );

            gltf.scene.traverse(obj => {
                if (obj.isMesh) {
                    obj.material = new THREE.MeshStandardMaterial({
                        color: color === "white"
                            ? 0xffffff
                            : 0x222222
                    });
                }
            });

            gltf.scene.scale.set(0.05, 0.05, 0.05);

            // STLs often need this
            gltf.scene.rotation.x = -Math.PI / 2;

            // rotate kings 90° around y bcz i dont want to edit the model again
            if (piece.toLowerCase() === "king") {
                gltf.scene.rotation.z = Math.PI / 2;
            }
            if (color === "black") {
                gltf.scene.rotation.y += Math.PI;
            }
            scene.add(gltf.scene);
        }
    );
}

// make sure the selection doesn't escape the board
function clampSelection() {
    selected.file = Math.max(0, Math.min(size - 1, selected.file));
    selected.plane = Math.max(0, Math.min(size - 1, selected.plane));
    selected.rank = Math.max(0, Math.min(size - 1, selected.rank));
}

// movement functions
function moveUp() {
    selected.plane--;
    clampSelection();
}
function moveDown() {
    selected.plane++;
    clampSelection();
}
function moveRight() {
    selected.file++;
    clampSelection();
}
function moveLeft() {
    selected.file--;
    clampSelection();
}
function moveFront() {
    selected.rank--;
    clampSelection();
}
function moveBack() {
    selected.rank++;
    clampSelection();
}
// event listener for keyboard input
window.addEventListener('keydown', (event) => {
    const blockedKeys = [
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'KeyQ',
        'KeyE',
        'Enter'
    ];
    if (blockedKeys.includes(event.code)) {
        event.preventDefault();
    }
    switch(event.code) {
        case 'KeyW':
            moveUp();
            break;
        case 'KeyA':
            moveLeft();
            break;
        case 'KeyS':
            moveDown();
            break;
        case 'KeyD':
            moveRight();
            break;
        case 'KeyQ':
            moveFront();
            break;
        case 'KeyE':
            moveBack();
            break;
        case 'Enter':
            // place piece
            break;
    }
    coordsInfo.textContent = `File: ${selected.file + 1} | Plane: ${selected.plane + 1} | Rank: ${selected.rank + 1}`;
});

// on-screen buttons input handling
document.getElementById("up").addEventListener('click', moveUp);
document.getElementById("down").addEventListener('click', moveDown);
document.getElementById("left").addEventListener('click', moveLeft);
document.getElementById("right").addEventListener('click', moveRight);
document.getElementById("front").addEventListener('click', moveFront);
document.getElementById("back").addEventListener('click', moveBack);
document.getElementById("place").addEventListener('click', console.log("PLACE placeholder"));

// starting pieces
for (let file = 0; file < size; file++) {
    placePiece(file, 0, 0, backRankWhite[file], "white");
}
for (let file = 0; file < size; file++) {
    placePiece(file, 1, 0, "pawn", "white");
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
    scene.traverse(obj => {
    if (obj.isMesh) {
        console.log(
            obj.name,
            obj.material,
            obj.material?.constructor?.name
        );
    }
});
    renderer.render(scene, camera);
}

// --- animate stuff ---
animate();