"use strict";

(() => {
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || 0));

  const multiplyMatrices = (left, right) => {
    const result = new Float32Array(16);
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        result[column * 4 + row] = (
          left[row] * right[column * 4]
          + left[4 + row] * right[column * 4 + 1]
          + left[8 + row] * right[column * 4 + 2]
          + left[12 + row] * right[column * 4 + 3]
        );
      }
    }
    return result;
  };

  const perspectiveMatrix = (fieldOfView, aspect, near = 0.1, far = 40) => {
    const f = 1 / Math.tan(fieldOfView / 2);
    const range = 1 / (near - far);
    return new Float32Array([
      f / Math.max(0.01, aspect), 0, 0, 0,
      0, f, 0, 0,
      0, 0, (near + far) * range, -1,
      0, 0, 2 * near * far * range, 0,
    ]);
  };

  const translationMatrix = (x, y, z) => new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ]);

  const rotationXMatrix = (angle) => {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return new Float32Array([
      1, 0, 0, 0,
      0, cosine, sine, 0,
      0, -sine, cosine, 0,
      0, 0, 0, 1,
    ]);
  };

  const rotationYMatrix = (angle) => {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return new Float32Array([
      cosine, 0, -sine, 0,
      0, 1, 0, 0,
      sine, 0, cosine, 0,
      0, 0, 0, 1,
    ]);
  };

  const compileShader = (gl, type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const detail = gl.getShaderInfoLog(shader) || "unknown shader error";
      gl.deleteShader(shader);
      throw new Error(`3D shader compilation failed: ${detail}`);
    }
    return shader;
  };

  const createProgram = (gl) => {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, `#version 300 es
      precision highp float;
      in vec3 aPosition;
      in vec2 aUv;
      uniform mat4 uMatrix;
      uniform float uDepthStrength;
      out vec2 vUv;
      out vec3 vPosition;
      out float vDepth;
      void main() {
        vec3 displaced = vec3(aPosition.xy, aPosition.z * uDepthStrength);
        vUv = aUv;
        vPosition = displaced;
        vDepth = displaced.z;
        gl_Position = uMatrix * vec4(displaced, 1.0);
      }
    `);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float;
      uniform sampler2D uTexture;
      uniform float uDetail;
      uniform float uGridOpacity;
      in vec2 vUv;
      in vec3 vPosition;
      in float vDepth;
      out vec4 outColor;
      void main() {
        vec3 base = texture(uTexture, vUv).rgb;
        vec3 normal = normalize(cross(dFdx(vPosition), dFdy(vPosition)));
        if (!gl_FrontFacing) normal *= -1.0;
        float light = 0.76 + 0.24 * abs(dot(normal, normalize(vec3(-0.35, 0.42, 0.84))));
        vec2 coordinate = vUv * uDetail;
        vec2 grid = abs(fract(coordinate - 0.5) - 0.5) / max(fwidth(coordinate), vec2(0.0001));
        float line = 1.0 - min(min(grid.x, grid.y), 1.0);
        vec3 shaded = base * light + max(vDepth, 0.0) * 0.035;
        shaded = mix(shaded, vec3(0.82, 0.58, 0.32), line * uGridOpacity);
        outColor = vec4(shaded, 1.0);
      }
    `);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const detail = gl.getProgramInfoLog(program) || "unknown program error";
      gl.deleteProgram(program);
      throw new Error(`3D shader linking failed: ${detail}`);
    }
    return program;
  };

  const sameOriginImage = (source) => new Promise((resolve, reject) => {
    const url = new URL(source, window.location.href);
    if (url.origin !== window.location.origin) {
      reject(new Error("3D spatial painting only loads same-origin project artifacts."));
      return;
    }
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`Unable to load 3D source image: ${url.pathname}`)), { once: true });
    image.src = url.href;
  });

  class DepthMeshViewer {
    constructor(canvas) {
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error("3D spatial painting requires a canvas element.");
      this.canvas = canvas;
      this.gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: true,
        depth: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true,
      });
      if (!this.gl) throw new Error("This browser does not provide WebGL 2 for 3D spatial painting.");

      this.program = createProgram(this.gl);
      this.locations = {
        position: this.gl.getAttribLocation(this.program, "aPosition"),
        uv: this.gl.getAttribLocation(this.program, "aUv"),
        matrix: this.gl.getUniformLocation(this.program, "uMatrix"),
        depthStrength: this.gl.getUniformLocation(this.program, "uDepthStrength"),
        texture: this.gl.getUniformLocation(this.program, "uTexture"),
        detail: this.gl.getUniformLocation(this.program, "uDetail"),
        gridOpacity: this.gl.getUniformLocation(this.program, "uGridOpacity"),
      };
      this.positionBuffer = this.gl.createBuffer();
      this.uvBuffer = this.gl.createBuffer();
      this.indexBuffer = this.gl.createBuffer();
      this.texture = this.gl.createTexture();
      this.source = null;
      this.indexCount = 0;
      this.detail = 96;
      this.depthStrength = 0.65;
      this.perspective = 0.58;
      this.wireframe = false;
      this.aspect = 1;
      this.yaw = -0.24;
      this.pitch = -0.1;
      this.distance = 4;
      this.pointer = null;
      this.loadSequence = 0;
      this.disposed = false;

      this.onPointerDown = (event) => {
        if (event.button !== 0) return;
        this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
        this.canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
      };
      this.onPointerMove = (event) => {
        if (!this.pointer || this.pointer.id !== event.pointerId) return;
        const deltaX = event.clientX - this.pointer.x;
        const deltaY = event.clientY - this.pointer.y;
        this.pointer.x = event.clientX;
        this.pointer.y = event.clientY;
        this.yaw += deltaX * 0.006;
        this.pitch = clamp(this.pitch + deltaY * 0.006, -1.15, 1.15);
        this.render();
        event.preventDefault();
        event.stopPropagation();
      };
      this.onPointerUp = (event) => {
        if (!this.pointer || this.pointer.id !== event.pointerId) return;
        this.pointer = null;
        if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
      };
      this.onWheel = (event) => {
        this.distance = clamp(this.distance + event.deltaY * 0.004, 2.2, 10);
        this.render();
        event.preventDefault();
        event.stopPropagation();
      };
      this.stopClick = (event) => event.stopPropagation();
      this.onDoubleClick = (event) => {
        this.resetView();
        event.preventDefault();
        event.stopPropagation();
      };
      this.canvas.addEventListener("pointerdown", this.onPointerDown);
      this.canvas.addEventListener("pointermove", this.onPointerMove);
      this.canvas.addEventListener("pointerup", this.onPointerUp);
      this.canvas.addEventListener("pointercancel", this.onPointerUp);
      this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
      this.canvas.addEventListener("click", this.stopClick);
      this.canvas.addEventListener("dblclick", this.onDoubleClick);
      this.resizeObserver = new ResizeObserver(() => this.render());
      this.resizeObserver.observe(this.canvas);
    }

    async load({ rgbUrl, depthUrl, detail, depthStrength, perspective, wireframe } = {}) {
      const sequence = ++this.loadSequence;
      const [rgbImage, depthImage] = await Promise.all([
        sameOriginImage(rgbUrl),
        sameOriginImage(depthUrl),
      ]);
      if (sequence !== this.loadSequence || this.disposed) return null;
      this.source = { rgbImage, depthImage };
      this.aspect = rgbImage.naturalWidth / Math.max(1, rgbImage.naturalHeight);
      this.detail = Math.round(clamp(detail ?? this.detail, 24, 160));
      this.depthStrength = clamp(depthStrength ?? this.depthStrength, 0, 2);
      this.perspective = clamp(perspective ?? this.perspective, 0, 1);
      this.wireframe = Boolean(wireframe);
      this.uploadTexture(rgbImage);
      this.rebuildGeometry();
      this.resetView();
      return this.report();
    }

    uploadTexture(image) {
      const gl = this.gl;
      const maximum = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096;
      let source = image;
      if (image.naturalWidth > maximum || image.naturalHeight > maximum) {
        const scale = Math.min(maximum / image.naturalWidth, maximum / image.naturalHeight);
        const resized = document.createElement("canvas");
        resized.width = Math.max(1, Math.round(image.naturalWidth * scale));
        resized.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = resized.getContext("2d");
        if (!context) throw new Error("Unable to prepare the RGB texture for WebGL.");
        context.drawImage(image, 0, 0, resized.width, resized.height);
        source = resized;
      }
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
    }

    rebuildGeometry() {
      if (!this.source) return;
      const detail = this.detail;
      const side = detail + 1;
      const sample = document.createElement("canvas");
      sample.width = side;
      sample.height = side;
      const context = sample.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Unable to sample the relative depth preview.");
      context.drawImage(this.source.depthImage, 0, 0, side, side);
      const pixels = context.getImageData(0, 0, side, side).data;
      const positions = new Float32Array(side * side * 3);
      const uvs = new Float32Array(side * side * 2);
      const width = 2 * this.aspect;

      for (let row = 0; row < side; row += 1) {
        const vertical = row / detail;
        for (let column = 0; column < side; column += 1) {
          const horizontal = column / detail;
          const vertex = row * side + column;
          const pixel = vertex * 4;
          const nearness = (pixels[pixel] + pixels[pixel + 1] + pixels[pixel + 2]) / (255 * 3);
          positions[vertex * 3] = (horizontal - 0.5) * width;
          positions[vertex * 3 + 1] = (0.5 - vertical) * 2;
          positions[vertex * 3 + 2] = (nearness - 0.5) * 2;
          uvs[vertex * 2] = horizontal;
          uvs[vertex * 2 + 1] = 1 - vertical;
        }
      }

      const indices = new Uint32Array(detail * detail * 6);
      let offset = 0;
      for (let row = 0; row < detail; row += 1) {
        for (let column = 0; column < detail; column += 1) {
          const topLeft = row * side + column;
          const bottomLeft = (row + 1) * side + column;
          indices.set([topLeft, bottomLeft, topLeft + 1, topLeft + 1, bottomLeft, bottomLeft + 1], offset);
          offset += 6;
        }
      }

      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      this.indexCount = indices.length;
      this.render();
    }

    setOptions({ detail, depthStrength, perspective, wireframe } = {}) {
      const nextDetail = Math.round(clamp(detail ?? this.detail, 24, 160));
      const nextStrength = clamp(depthStrength ?? this.depthStrength, 0, 2);
      const geometryChanged = nextDetail !== this.detail;
      this.detail = nextDetail;
      this.depthStrength = nextStrength;
      this.perspective = clamp(perspective ?? this.perspective, 0, 1);
      this.wireframe = wireframe === undefined ? this.wireframe : Boolean(wireframe);
      if (geometryChanged) this.rebuildGeometry();
      else this.render();
      return this.report();
    }

    resetView() {
      this.yaw = -0.24;
      this.pitch = -0.1;
      this.distance = 3.8 + Math.max(0, this.aspect - 1) * 0.55;
      this.render();
    }

    resize() {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(this.canvas.clientWidth * pixelRatio));
      const height = Math.max(1, Math.round(this.canvas.clientHeight * pixelRatio));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.gl.viewport(0, 0, width, height);
      return width / Math.max(1, height);
    }

    render() {
      if (this.disposed) return;
      const gl = this.gl;
      const viewportAspect = this.resize();
      gl.clearColor(0.105, 0.112, 0.106, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!this.source || !this.indexCount) return;

      const fieldOfView = (32 + this.perspective * 34) * Math.PI / 180;
      const projection = perspectiveMatrix(fieldOfView, viewportAspect);
      const rotation = multiplyMatrices(rotationXMatrix(this.pitch), rotationYMatrix(this.yaw));
      const view = multiplyMatrices(translationMatrix(0, 0, -this.distance), rotation);
      const matrix = multiplyMatrices(projection, view);

      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(this.program);
      gl.uniformMatrix4fv(this.locations.matrix, false, matrix);
      gl.uniform1f(this.locations.depthStrength, this.depthStrength);
      gl.uniform1f(this.locations.detail, this.detail);
      gl.uniform1f(this.locations.gridOpacity, this.wireframe ? 0.48 : 0.055);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.uniform1i(this.locations.texture, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.enableVertexAttribArray(this.locations.position);
      gl.vertexAttribPointer(this.locations.position, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
      gl.enableVertexAttribArray(this.locations.uv);
      gl.vertexAttribPointer(this.locations.uv, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
    }

    report() {
      return {
        ready: Boolean(this.source && this.indexCount),
        detail: this.detail,
        vertices: (this.detail + 1) ** 2,
        triangles: this.detail * this.detail * 2,
        depthStrength: this.depthStrength,
        perspective: this.perspective,
        wireframe: this.wireframe,
        sourceSize: this.source ? [this.source.rgbImage.naturalWidth, this.source.rgbImage.naturalHeight] : null,
      };
    }

    dispose() {
      this.disposed = true;
      this.loadSequence += 1;
      this.resizeObserver.disconnect();
      this.canvas.removeEventListener("pointerdown", this.onPointerDown);
      this.canvas.removeEventListener("pointermove", this.onPointerMove);
      this.canvas.removeEventListener("pointerup", this.onPointerUp);
      this.canvas.removeEventListener("pointercancel", this.onPointerUp);
      this.canvas.removeEventListener("wheel", this.onWheel);
      this.canvas.removeEventListener("click", this.stopClick);
      this.canvas.removeEventListener("dblclick", this.onDoubleClick);
      this.gl.deleteBuffer(this.positionBuffer);
      this.gl.deleteBuffer(this.uvBuffer);
      this.gl.deleteBuffer(this.indexBuffer);
      this.gl.deleteTexture(this.texture);
      this.gl.deleteProgram(this.program);
    }
  }

  window.LayeredSpatial3D = Object.freeze({ DepthMeshViewer });
})();
