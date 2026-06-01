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
let activePiece = null;
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
const backRankBlack = [
    "Rook",
    "Knight",
    "Bishop",
    "King",
    "Queen",
    "Bishop",
    "Knight",
    "Rook"
];
const backRankSecond = [
    "Rook",
    "Knight",
    "Bishop",
    "Unicorn",
    "Unicorn",
    "Bishop",
    "Knight",
    "Rook"
];

// scene
const scene = new THREE.Scene();

// camera
const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.z = 12;
camera.position.y = 2
window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      needsRender = true;
  });

// reusable geometry — ONE shared instance for all cells
const geometry = new THREE.BoxGeometry(1, 1, 1);
// FIX: EdgesGeometry computed once from the shared geometry
const sharedEdges = new THREE.EdgesGeometry(geometry);

// renderer
const renderer = new THREE.WebGLRenderer({
    antialias: true  // FIX: was "anitalias" (typo — the option was silently ignored)
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

// FIX: track whether controls are active so we only re-render when needed
let controlsActive = false;
controls.addEventListener('start', () => { controlsActive = true; });
controls.addEventListener('end',   () => { controlsActive = false; });

// ambient light
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// directional light
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(12, 12, 12);
scene.add(directionalLight);

// fake environtment
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new THREE.Scene()).texture;

// FIX: share one material instance per (even/odd) × (wire/box) combination
//      instead of creating 1024+ individual material objects
const boxMaterialShared = new THREE.MeshStandardMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 0.01
});
const wireMaterialEven = new THREE.LineBasicMaterial({
    color: 0xe0f0ef,
    transparent: true,
    opacity: 0.5
});
const wireMaterialOdd = new THREE.LineBasicMaterial({
    color: 0x815438,
    transparent: true,
    opacity: 0.5
});

// FIX: the selected cell needs its own non-shared box material so we can
//      highlight it without affecting every other cell
const selectedBoxMaterial = new THREE.MeshStandardMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 0.5
});

// track the previously selected cell to restore its material on move
let previousSelectedCell = null;

// board cells
for (let file = 0; file < size; file++) {
    cells[file] = [];
    for (let plane = 0; plane < size; plane++) {
        cells[file][plane] = [];
        for (let rank = 0; rank < size; rank++) {
            const isEven = (file + plane + rank) % 2 === 0;

            // FIX: share the single edge geometry; share materials per parity
            const wire = new THREE.LineSegments(
                sharedEdges,
                isEven ? wireMaterialEven : wireMaterialOdd
            );
            // FIX: each box still needs its own material instance so we can
            //      swap it out for the selected-highlight material
            const boxMat = boxMaterialShared.clone();
            const box = new THREE.Mesh(geometry, boxMat);

            const cell = new THREE.Group();
            cells[file][plane][rank] = cell;
            cell.userData.box = box;
            cell.userData.wire = wire;
            cell.userData.file = file;
            cell.userData.plane = plane;
            cell.userData.rank = rank;

            cell.position.x =  (file  - (size - 1) / 2);
            cell.position.y = -(plane - (size - 1) / 2);
            cell.position.z = -(rank  - (size - 1) / 2);

            cell.add(box);
            cell.add(wire);
            box.userData.parentCell  = cell;
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

// FIX: cache loaded GLTF scenes so each piece type is only fetched once;
//      subsequent placements clone the cached scene instead of re-fetching
const modelCache = {};

function placePiece(file, plane, rank, piece, color) {
    if (!board[file] || !board[file][plane]) {
        console.error("BROKEN BOARD STATE:", file, plane, rank);
        debugger;
    }
    console.log("board slot:", board[file], board[file]?.[plane]);
    board[file][plane][rank] = new Piece(piece, color);

    const applyModel = (gltfScene) => {
        // FIX: clone so each placed piece is an independent object
        const model = gltfScene.clone(true);

        model.position.set(
            (file  - (size - 1) / 2),
            -(plane - (size - 1) / 2) - 0.5,
            -(rank  - (size - 1) / 2)
        );

        const pieceMat = new THREE.MeshStandardMaterial({
            color: color === "white" ? 0xeeeeff : 0x222233,
            metalness: 0.5,
            roughness: 0.1
        });
        model.traverse(obj => {
            if (obj.isMesh) obj.material = pieceMat;
        });

        model.scale.set(0.05, 0.05, 0.05);
        model.rotation.x = -Math.PI / 2;

        if (piece.toLowerCase() === "king") {
            model.rotation.z = Math.PI / 2;
        }
        if (color === "black") {
            model.rotation.z += Math.PI;
        }
        scene.add(model);
        cells[file][plane][rank].userData.pieceModel = model;
    };

    if (modelCache[piece]) {
        // already loaded — clone immediately, no extra network request
        applyModel(modelCache[piece]);
    } else {
        loader.load(
            `assets/3D models/${piece}.glb`,
            gltf => {
                modelCache[piece] = gltf.scene;
                applyModel(gltf.scene);
                gltf.scene.userData.boardPos = { file, plane, rank };
            }
        );
    }
}

// loaders — declared after placePiece so the cache reference is in scope
const loader = new GLTFLoader();

// move validation
// check if the piece is an enemy piece
function isTarget(f, p, r, color) {
    if (f<0 || f>7 || p<0 || p>7 || r<0 || r>7) return false;
    const target = getPiece(f, p, r);
    return !target || target.color !== color;
}
// slide in a direction until blocked
function slide(file, plane, rank, color, directions) {
    const moves = [];
    for (const [df, dp, dr] of directions) {
        let f = file + df, p = plane + dp, r = rank + dr;
        while (f>=0 && f<8 && p>=0 && p<8 && r>=0 && r<8) {
            const target = getPiece(f, p, r);
            if (target) {
                if (target.color !== color) moves.push({ file: f, plane: p, rank: r }); // capture
                break;
            }
            moves.push({ file: f, plane: p, rank: r });
            f += df; p += dp; r += dr;
        }
    }
    return moves;
}
// get all possible moves
function getRookMoves(file, plane, rank, color) {
    return slide(file, plane, rank, color, [
        [1,0,0],[-1,0,0],
        [0,1,0],[0,-1,0],
        [0,0,1],[0,0,-1]
    ]);
}
function getBishopMoves(file, plane, rank, color) {
    return slide(file, plane, rank, color, [
        // XY plane diagonals
        [1,1,0],[1,-1,0],[-1,1,0],[-1,-1,0],
        // XZ plane diagonals
        [1,0,1],[1,0,-1],[-1,0,1],[-1,0,-1],
        // YZ plane diagonals
        [0,1,1],[0,1,-1],[0,-1,1],[0,-1,-1]
    ]);
}
function getUnicornMoves(file, plane, rank, color) {
    return slide(file, plane, rank, color, [
        [1,1,1],
        [1,1,-1],
        [1,-1,1],
        [1,-1,-1],
        [-1,1,1],
        [-1,1,-1],
        [-1,-1,1],
        [-1,-1,-1]
    ]);
}
function getKnightMoves(file, plane, rank, color) {
    const moves = [];
    // 2 steps on one axis, 1 on another; all combinations
    const deltas = [
        [2,1,0],[2,-1,0],[-2,1,0],[-2,-1,0],
        [2,0,1],[2,0,-1],[-2,0,1],[-2,0,-1],
        [1,2,0],[1,-2,0],[-2,1,0],[-2,-1,0],
        [0,2,1],[0,2,-1],[0,-2,1],[0,-2,-1],
        [1,0,2],[1,0,-2],[-1,0,2],[-1,0,-2],
        [0,1,2],[0,1,-2],[0,-1,2],[0,-1,-2]
    ];
    for (const [df, dp, dr] of deltas) {
        const f = file + df, p = plane + dp, r = rank + dr;
        if (isTarget(f, p, r, color)) moves.push({ file: f, plane: p, rank: r });
    }
    return moves;
}
function getKingMoves(file, plane, rank, color) {
    const moves = [];
    for (let df = -1; df <= 1; df++) {
        for (let dp = -1; dp <= 1; dp++) {
            for (let dr = -1; dr <= 1; dr++) {
                if (df === 0 && dp === 0 && dr === 0) continue; // skip self's position
                const f = file + df, p = plane + dp, r = rank + dr;
                if (isTarget(f, p, r, color)) moves.push({ file: f, plane: p, rank: r });
            }
        }
    }
    return moves;
}
function getPawnMoves(file, plane, rank, color) {
    const moves = [];
    const [fwd1, fwd2] = color === "white" ? [1, -1] : [-1, 1];

    const isStarting = color === "white" ? (rank === 1) : (rank === 6);

    // +rank direction
    const r1 = rank + fwd1;
    if (r1 >= 0 && r1 < 8 && !getPiece(file, plane, r1)) {
        moves.push({ file, plane, rank: r1 });
        // 2-step only if starting and the intermediate square was empty (already checked)
        const r2 = rank + fwd1 * 2;
        if (isStarting && r2 >= 0 && r2 < 8 && !getPiece(file, plane, r2)) {
            moves.push({ file, plane, rank: r2 });
        }
    }

    // -plane direction
    const p1 = plane + fwd2;
    if (p1 >= 0 && p1 < 8 && !getPiece(file, p1, rank)) {
        moves.push({ file, plane: p1, rank });
        const p2 = plane + fwd2 * 2;
        if (isStarting && p2 >= 0 && p2 < 8 && !getPiece(file, p2, rank)) {
            moves.push({ file, plane: p2, rank });
        }
    }

    // captures
    const captures = [
        { file: file+1, plane, rank: rank + fwd1 },
        { file: file-1, plane, rank: rank + fwd1 },
        { file: file+1, plane: plane + fwd2, rank },
        { file: file-1, plane: plane + fwd2, rank }
    ];
    for (const m of captures) {
        if (m.file >= 0 && m.file < 8 && m.plane >= 0 && m.plane < 8 && m.rank >= 0 && m.rank < 8) {
            const target = getPiece(m.file, m.plane, m.rank);
            if (target && target.color !== color) moves.push(m);
        }
    }

    return moves;
}
function getValidMoves(file, plane, rank) {
    const piece = getPiece(file, plane, rank);
    if (!piece) return [];
    switch (piece.type) {
        case "Pawn": return getPawnMoves(file, plane, rank, piece.color);
        case "Rook": return getRookMoves(file, plane, rank, piece.color);
        case "Knight": return getKnightMoves(file, plane, rank, piece.color);
        case "Bishop": return getBishopMoves(file, plane, rank, piece.color);
        case "Queen": return [...getRookMoves(file, plane, rank, piece.color), ...getBishopMoves(file, plane, rank, piece.color)];
        case "King": return getKingMoves(file, plane, rank, piece.color);
        case "Unicorn": return getUnicornMoves(file, plane, rank, piece.color);
        default: return [];
    }
}

// move pieces
function movePiece(from, to) {
    const piece = board[from.file][from.plane][from.rank];
    if (!piece) return;
    // move validation
    const valid = getValidMoves(from.file, from.plane, from.rank);
    const allowed = valid.some(m => m.file === to.file && m.plane === to.plane && m.rank === to.rank);
    if (!allowed) {
        console.log("illegal move!");
        activePiece = null; // deselect
        return;
    }
    // game state update
    const capturedPiece = board[to.file][to.plane][to.rank];
    if (capturedPiece) {
        const capturedModel = cells[to.file][to.plane][to.rank];
        if (capturedModel) scene.remove(capturedModel);
    }
    board[to.file][to.plane][to.rank] = piece;
    board[from.file][from.plane][from.rank] = null;
    // visual update
    const model = cells[from.file][from.plane][from.rank].userData.pieceModel;
    if (model) {
        model.position.set(
            (to.file - (size - 1) / 2),
            -(to.plane - (size - 1) / 2) - 0.5,
            -(to.rank - (size - 1) / 2)
        );
        cells[to.file][to.plane][to.rank].userData.pieceModel = model;
        cells[from.file][from.plane][from.rank].userData.pieceModel = null;
    }
    needsRender = true;
}

// make sure the selection doesn't escape the board
function clampSelection() {
    selected.file  = Math.max(0, Math.min(size - 1, selected.file));
    selected.plane = Math.max(0, Math.min(size - 1, selected.plane));
    selected.rank  = Math.max(0, Math.min(size - 1, selected.rank));
}

// FIX: update highlight by swapping materials on only two cells rather than
//      iterating all 512 cells every frame
function updateHighlight() {
    if (previousSelectedCell) {
        // restore previous cell to default (dim) material
        previousSelectedCell.userData.box.material.opacity = 0.01;
    }
    const cell = cells[selected.file][selected.plane][selected.rank];
    cell.userData.box.material.opacity = 0.5;
    previousSelectedCell = cell;
    needsRender = true; // flag a re-render
}

// dirty flag — only render when something has actually changed
let needsRender = true;

// movement functions
function moveUp()    { selected.plane--; clampSelection(); updateHighlight(); coordsInfo.textContent = `File: ${selected.file + 1} | Plane: ${selected.plane + 1} | Rank: ${selected.rank + 1}`; }
function moveDown()  { selected.plane++; clampSelection(); updateHighlight(); coordsInfo.textContent = `File: ${selected.file + 1} | Plane: ${selected.plane + 1} | Rank: ${selected.rank + 1}`; }
function moveRight() { selected.file++;  clampSelection(); updateHighlight(); coordsInfo.textContent = `File: ${selected.file + 1} | Plane: ${selected.plane + 1} | Rank: ${selected.rank + 1}`; }
function moveLeft()  { selected.file--;  clampSelection(); updateHighlight(); coordsInfo.textContent = `File: ${selected.file + 1} | Plane: ${selected.plane + 1} | Rank: ${selected.rank + 1}`; }
function moveFront() { selected.rank--;  clampSelection(); updateHighlight(); coordsInfo.textContent = `File: ${selected.file + 1} | Plane: ${selected.plane + 1} | Rank: ${selected.rank + 1}`; }
function moveBack()  { selected.rank++;  clampSelection(); updateHighlight(); coordsInfo.textContent = `File: ${selected.file + 1} | Plane: ${selected.plane + 1} | Rank: ${selected.rank + 1}`; }

// event listener for keyboard input
window.addEventListener('keydown', (event) => {
    console.log(event.code);
    const blockedKeys = ['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','Enter'];
    if (blockedKeys.includes(event.code)) event.preventDefault();

    switch(event.code) {
        case 'KeyW': moveUp();    break;
        case 'KeyA': moveLeft();  break;
        case 'KeyS': moveDown();  break;
        case 'KeyD': moveRight(); break;
        case 'KeyQ': moveFront(); break;
        case 'KeyE': moveBack();  break;
        case 'Enter':
            console.log("Enter hit", activePiece, board[selected.file][selected.plane][selected.rank]);
            if (!activePiece) {
                if (!board[selected.file][selected.plane][selected.rank]) return;
                activePiece = { ...selected };
                cells[activePiece.file][activePiece.plane][activePiece.rank]
                    .userData.box.material.opacity = 0.8;
                needsRender = true;
                break;
            } else {
                movePiece(activePiece, { ...selected });
                activePiece = null;
            }
            break;
    }
});

// on-screen buttons
document.getElementById("up").addEventListener('click',    moveUp);
document.getElementById("down").addEventListener('click',  moveDown);
document.getElementById("left").addEventListener('click',  moveLeft);
document.getElementById("right").addEventListener('click', moveRight);
document.getElementById("front").addEventListener('click', moveFront);
document.getElementById("back").addEventListener('click',  moveBack);
// FIX: was console.log("PLACE placeholder") — executed immediately at parse time
document.getElementById("place").addEventListener('click', () => console.log("PLACE placeholder"));

// starting pieces
for (let file = 0; file < size; file++) {
    // white pieces
    placePiece(file, 0, 0, backRankWhite[file], "white");
    placePiece(file, 0, 1, "Pawn", "white");
    placePiece(file, 1, 0, backRankSecond[file], "white");
    placePiece(file, 1, 1, "Pawn", "white");
    // black pieces
    placePiece(file, 7, 7, backRankBlack[file], "black");
    placePiece(file, 7, 6, "Pawn", "black");
    placePiece(file, 6, 7, backRankSecond[file], "black");
    placePiece(file, 6, 6, "Pawn", "black");
}

// initialise highlight on the starting cell
updateHighlight();

// animation loop
function animate() {
    requestAnimationFrame(animate);

    const damping = controls.enableDamping;

    // FIX: only call controls.update() when damping is active AND the user
    //      is interacting (or damping is still decelerating)
    if (damping && (controlsActive || controls.update())) {
        needsRender = true;
    }

    // FIX: skip rendering entirely when nothing has changed
    // FIX: removed the per-frame scene.traverse() debug logger
    if (!needsRender) return;
    needsRender = false;

    renderer.render(scene, camera);
}

// mark dirty whenever controls finish a move (damping needs a few extra frames)
controls.addEventListener('change', () => { needsRender = true; });

animate();