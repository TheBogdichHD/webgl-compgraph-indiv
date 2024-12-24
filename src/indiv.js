import { createProgram } from "./webgl-utils.js";
import { parseOBJWithNormals } from "./obj-loader.js";
import { mat4, vec3, glMatrix } from "https://cdn.jsdelivr.net/npm/gl-matrix@3.4.3/+esm";

const distanceScale = 0;

class Camera {
    constructor(target = [0.0, 0.0, 0.0], distance = 4.0, up = [0.0, 1.0, 0.0], yaw = -90.0, pitch = 15.0) {
        this.target = vec3.clone(target);
        this.distance = distance;
        this.position = vec3.create();
        this.worldUp = vec3.clone(up);
        this.front = vec3.fromValues(0.0, 0.0, -1.0);
        this.right = vec3.create();
        this.up = vec3.clone(up);
        this.yaw = yaw;
        this.pitch = pitch;
        this.minPitch = -89;
        this.maxPitch = 89;
        this.updateVectors();
    }

    updateVectors() {
        // Calculate the front vector
        const radYaw = glMatrix.toRadian(this.yaw);
        const radPitch = glMatrix.toRadian(this.pitch);
        this.front[0] = Math.cos(radPitch) * Math.cos(radYaw);
        this.front[1] = Math.sin(radPitch);
        this.front[2] = Math.cos(radPitch) * Math.sin(radYaw);
        vec3.normalize(this.front, this.front);

        // Calculate the right vector
        vec3.cross(this.right, this.front, this.worldUp); // Right = Front × WorldUp
        vec3.normalize(this.right, this.right);

        // Calculate the up vector
        vec3.cross(this.up, this.right, this.front); // Up = Right × Front
        vec3.normalize(this.up, this.up);

        // Update camera position
        this.position[0] = this.target[0] - this.distance * this.front[0];
        this.position[1] = this.target[1] - this.distance * this.front[1];
        this.position[2] = this.target[2] - this.distance * this.front[2];
    }

    getViewMatrix() {
        return mat4.lookAt(mat4.create(), this.position, this.target, this.up);
    }

    processMouseWheel(delta) {
        const zoomSpeed = 0.2; // Zoom speed factor, adjust as needed
        const zoomDirection = delta > 0 ? 1 : -1;

        // Smooth zoom logic
        const zoomAmount = zoomDirection * zoomSpeed;

        // Apply a smooth transition for the camera distance using interpolation
        camera.distance += zoomAmount;

        // Optionally clamp the distance to avoid going too far
        camera.distance = Math.max(2.0, Math.min(camera.distance, 10.0));

        this.updateVectors();
    }

    processMouseMovement(xoffset, yoffset) {
        xoffset *= 0.2; // Mouse sensitivity
        yoffset *= 0.2;


        this.yaw += xoffset;
        this.pitch = Math.min(Math.max(this.pitch + yoffset, this.minPitch), this.maxPitch);;

        if (this.yaw < 0) this.yaw += 360;
        if (this.pitch > 360) this.yaw -= 360;

        this.updateVectors();
    }

    setTarget(newTarget) {
        vec3.copy(this.target, newTarget);
        this.updateVectors();
    }
}



export class Object3D {
    constructor(gl, program, objData, textureUrl, scale) {
        this.gl = gl;
        this.program = program;

        const { positions, texCoords, normals } = parseOBJWithNormals(objData);

        for (let i = 0; i < positions.length; i++) {
            positions[i] *= scale;
        }

        this.vertexCount = positions.length / 3;

        // Create and bind VAO
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        // Create position buffer
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        // Create texture coordinate buffer
        this.texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

        this.vertexNormalsBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexNormalsBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);

        // Instance Matrix Buffer
        this.instanceMatrixBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceMatrixBuffer);

        for (let i = 0; i < 4; i++) {
            gl.enableVertexAttribArray(3 + i); // Attributes 3, 4, 5, 6
            gl.vertexAttribPointer(3 + i, 4, gl.FLOAT, false, 64, i * 16);
            gl.vertexAttribDivisor(3 + i, 1); // One matrix per instance
        }

        gl.bindVertexArray(null);

        // Load texture
        this.texture = gl.createTexture();
        const image = new Image();
        image.src = textureUrl;
        image.onload = () => {
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.generateMipmap(gl.TEXTURE_2D);
        };
    }

    updateInstanceMatrices(matrices) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceMatrixBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, matrices, gl.DYNAMIC_DRAW);
    }

    renderInstanced(instanceCount, viewMatrix) {
        const gl = this.gl;

        gl.useProgram(this.program);

        // Set the uniform matrix explicitly
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, "uMatrix"), false, viewMatrix);

        gl.bindVertexArray(this.vao);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, this.vertexCount, instanceCount);

        gl.bindVertexArray(null);
    }



    render(models, view, projection, numInstances = 1) {
        /** @type {WebGL2RenderingContext} */
        const gl = this.gl;

        this.updateInstanceMatrices(models);

        gl.useProgram(this.program);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, "uViewMatrix"), false, view);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, "uProjectionMatrix"), false, projection);

        const dirLightLoc = {
            direction: gl.getUniformLocation(this.program, "uDirLight.direction"),
            color: gl.getUniformLocation(this.program, "uDirLight.color"),
            intensity: gl.getUniformLocation(this.program, "uDirLight.intensity"),
        };

        // Set values for Directional Light
        gl.uniform3fv(dirLightLoc.direction, [-0.5, -1.0, -0.5]); // Direction
        gl.uniform3fv(dirLightLoc.color, [1.0, 1.0, 1.0]);        // Color
        gl.uniform1f(dirLightLoc.intensity, 1.2);                 // Intensity


        gl.uniform3fv(gl.getUniformLocation(this.program, "uViewPos"), camera.position);

        gl.bindVertexArray(this.vao);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, this.vertexCount, numInstances);

        gl.bindVertexArray(null);
    }
}


const camera = new Camera([0, 2, 10]);
let lastFrame = 0;

const keys = {};
class Zeppelin {
    constructor(gl, program, objData, textureUrl) {
        this.object = new Object3D(gl, program, objData, textureUrl, 0.02);
        this.position = vec3.fromValues(0, 0, 0);
        this.rotation = vec3.fromValues(0, 0, 0);
        this.camera_forward = vec3.create();
        this.spotlight_on = true;
        this.camera_transitioning = false;
    }

    update(deltaTime, camera) {
        const moveSpeed = 1.5;
        const rotateSpeed = 0.7;

        if (keys["w"]) vec3.scaleAndAdd(this.position, this.position, [camera.front[0], 0, camera.front[2]], moveSpeed * deltaTime);
        if (keys["s"]) vec3.scaleAndAdd(this.position, this.position, [camera.front[0], 0, camera.front[2]], -moveSpeed * deltaTime);
        if (keys["a"]) vec3.scaleAndAdd(this.position, this.position, [camera.right[0], 0, camera.right[2]], -moveSpeed * deltaTime);
        if (keys["d"]) vec3.scaleAndAdd(this.position, this.position, [camera.right[0], 0, camera.right[2]], moveSpeed * deltaTime);
        if (keys["q"]) vec3.scaleAndAdd(this.position, this.position, [0, camera.up[1], 0], moveSpeed * deltaTime);
        if (keys["e"]) vec3.scaleAndAdd(this.position, this.position, [0, camera.up[1], 0], -moveSpeed * deltaTime);
        this.camera_forward = camera.front;

        if (keys["w"] || keys["s"] || keys["a"] || keys["d"] || keys["q"] || keys["e"]) {
            const forward = vec3.fromValues(camera.front[0], 0, camera.front[2]);
            vec3.normalize(forward, forward);

            const targetYaw = -Math.atan2(forward[2], forward[0]);
            var deltaYaw = targetYaw - this.rotation[1];

            if (deltaYaw > Math.PI) deltaYaw -= 2 * Math.PI;
            if (deltaYaw < -Math.PI) deltaYaw += 2 * Math.PI;

            if (Math.abs(deltaYaw) >= 1e-2)
                this.rotation[1] += deltaYaw * deltaTime * rotateSpeed;
        }

        const target = vec3.create();
        const delta = vec3.create();
        vec3.copy(target, this.position);
        if (this.spotlight_on) {
            vec3.scaleAndAdd(target, target, camera.front, 4.5);
            vec3.scaleAndAdd(target, target, [camera.front[0], -5.3, 0], 0.1);
            camera.distance = 5.5;
            camera.minPitch = -25;
            camera.maxPitch = 20;
        }
        if (this.camera_transitioning) {
            //vec3.lerp(delta, camera.target, target, 0.1 * moveSpeed);
            const vecDiff = vec3.create();
            vec3.subtract(vecDiff, target, delta);
            if (vec3.length(vecDiff) < 0.15) {
                this.camera_transitioning = false;
            }
        }
        else {
            vec3.copy(delta, target);
        }

        camera.setTarget(delta);
    }


    render(viewMatrix, projectionMatrix) {
        const modelMatrix = mat4.create();
        mat4.translate(modelMatrix, modelMatrix, this.position);
        mat4.rotateY(modelMatrix, modelMatrix, Math.PI + this.rotation[1]);
        mat4.rotateZ(modelMatrix, modelMatrix, glMatrix.toRadian(this.rotation[2]));

        this.object.render(modelMatrix, viewMatrix, projectionMatrix);
    }
}


async function main() {
    const canvas = document.getElementById("gl-canvas");
    /** @type {WebGL2RenderingContext} */
    const gl = canvas.getContext("webgl2");
    if (!gl) {
        console.error("WebGL2 is not supported.");
        return;
    }

    const vertexShaderSource = `#version 300 es
    layout(location = 0) in vec3 aPosition;
    layout(location = 1) in vec2 aTexCoord;
    layout(location = 2) in vec3 aNormal;
    layout(location = 3) in mat4 aModelMatrix;

    uniform mat4 uViewMatrix, uProjectionMatrix;
    uniform vec3 uViewPos;
    out vec3 vNormal;
    out vec3 vFragPos;
    out vec2 vTexCoord;
    out vec3 viewDir;

    void main() {
        vNormal = normalize(mat3(transpose(inverse(aModelMatrix))) * aNormal);
        vFragPos = vec3(aModelMatrix * vec4(aPosition, 1.0));
        vTexCoord = aTexCoord;
        gl_Position = uProjectionMatrix * uViewMatrix * aModelMatrix * vec4(aPosition, 1.0);
        viewDir = normalize(uViewPos - vFragPos);
    }`;


    const fragmentShaderSource = `#version 300 es
    precision mediump float;

    in vec3 vNormal;
    in vec3 vFragPos;
    in vec2 vTexCoord;
    in vec3 viewDir;

    // Light properties
    struct Light {
        vec3 position;
        vec3 direction;
        vec3 color;
        float intensity;
        vec3 attenuation;
    };

    uniform Light uDirLight;

    // Texture samplers
    uniform sampler2D uTexture;

    // Outputs
    out vec4 FragColor;

    void main() {
        vec3 normal = vNormal;
        vec4 texColor = texture(uTexture, vTexCoord);

        vec3 resultColor = vec3(0.0);

        // Directional Light
        vec3 lightDir = normalize(-uDirLight.direction);
        float diff = max(dot(normal, lightDir), 0.0);
        vec3 dirLightColor = uDirLight.color * diff * uDirLight.intensity;

        resultColor += dirLightColor;

        FragColor = vec4(resultColor * texColor.rgb, texColor.a);
    }`;

    const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
    const objData = await fetch("../models/zeppelin.obj").then((res) => res.text());
    const textureUrl = "../images/zeppelin.png";

    const zeppelin = new Zeppelin(gl, program, objData, textureUrl);

    function resizeCanvasToDisplaySize(canvas) {
        const displayWidth = canvas.clientWidth * window.devicePixelRatio;
        const displayHeight = canvas.clientHeight * window.devicePixelRatio;
        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
            gl.viewport(0, 0, displayWidth, displayHeight);
        }
    }

    const treeData = await fetch("../models/tree.obj").then((res) => res.text());
    const treeTexture = "../images/tree.png";
    const treeObject = new Object3D(gl, program, treeData, treeTexture, 4.0);

    const nokiaData = await fetch("../models/nokia.obj").then((res) => res.text());
    const nokiaTexture = "../images/nokia.png";
    const nokiaObject = new Object3D(gl, program, nokiaData, nokiaTexture, 0.003);

    const cloudData = await fetch("../models/cloud.obj").then((res) => res.text());
    const cloudTexture = "../images/Cloud.png";
    const cloudObject = new Object3D(gl, program, cloudData, cloudTexture, 0.01);

    const landData = await fetch("../models/land.obj").then((res) => res.text());
    const landTexture = "../images/Cloud.png";
    const landObject = new Object3D(gl, program, landData, landTexture, 100.0);
    
    const numClouds = 20;
    const cloudMatrices = new Float32Array(16 * numClouds);
    for (var i = 0; i < numClouds; i++) {
        const cloudMatrix = mat4.create();
        mat4.translate(cloudMatrix, cloudMatrix, [Math.random() * 30 - 15, -Math.random() * 4 + 8, Math.random() * 30 - 15]);
        mat4.rotateX(cloudMatrix, cloudMatrix, Math.random());
        mat4.rotateY(cloudMatrix, cloudMatrix, Math.random());
        mat4.rotateZ(cloudMatrix, cloudMatrix, Math.random());
        cloudMatrices.set(cloudMatrix, i * 16);
    }

    const numNokias = 20;
    const nokiaMatrices = new Float32Array(16 * numNokias);
    for (var i = 0; i < numNokias; i++) {
        const nokiaMatrix = mat4.create();
        mat4.translate(nokiaMatrix, nokiaMatrix, [Math.random() * 30 - 15, -Math.random() * 4 + 8, Math.random() * 30 - 15]);
        mat4.rotateX(nokiaMatrix, nokiaMatrix, Math.random());
        mat4.rotateY(nokiaMatrix, nokiaMatrix, Math.random());
        mat4.rotateZ(nokiaMatrix, nokiaMatrix, Math.random());
        nokiaMatrices.set(nokiaMatrix, i * 16);
    }

    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.enable(gl.DEPTH_TEST);
    async function render(time) {
        resizeCanvasToDisplaySize(canvas);
        const deltaTime = (time - lastFrame) / 1000.0;
        lastFrame = time;

        // Clear the screen
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Update objects
        zeppelin.update(deltaTime, camera);


        // Create matrices
        const projectionMatrix = mat4.create();
        mat4.perspective(projectionMatrix, glMatrix.toRadian(45), canvas.width / canvas.height, 0.1, 100.0);
        const viewMatrix = camera.getViewMatrix();


        // Render zeppelin
        zeppelin.render(viewMatrix, projectionMatrix);

        const treeModel = mat4.create();
        mat4.translate(treeModel, treeModel, [0, -10, 0]);



        const treesModels = new Float32Array(16 * 1);
        treesModels.set(treeModel, 0);

        const landModel = mat4.create();
        mat4.translate(landModel, landModel, [0, -10, 0]);
        const landModels = new Float32Array(16 * 1);
        landModels.set(landModel, 0);

        const now = Date.now() / 1000;


        treeObject.render(treesModels, viewMatrix, projectionMatrix, 1);

        nokiaObject.render(nokiaMatrices, viewMatrix, projectionMatrix, numNokias);

        landObject.render(landModels, viewMatrix, projectionMatrix)
        
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        cloudObject.render(cloudMatrices, viewMatrix, projectionMatrix, numClouds);


        requestAnimationFrame(render);
    }

    window.addEventListener("keydown", (e) => {
        keys[e.key.toLowerCase()] = true;
        if (e.key.toLowerCase() == "l") {
            zeppelin.spotlight_on = !zeppelin.spotlight_on;
            zeppelin.camera_transitioning = true;
        }
    });
    window.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));

    canvas.addEventListener("click", () => canvas.requestPointerLock());
    document.addEventListener("mousemove", (event) => {
        if (document.pointerLockElement === canvas) {
            camera.processMouseMovement(event.movementX, -event.movementY);
        }
    });

    canvas.addEventListener("wheel", (event) => {
        let delta = event.deltaY;
        camera.processMouseWheel(delta);
        event.preventDefault();
    });

    requestAnimationFrame(render);

}

main();