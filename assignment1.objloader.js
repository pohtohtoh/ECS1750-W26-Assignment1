import { loadExternalFile } from './js/utils/utils.js'

/**
 * A class to load OBJ files from disk
 */
class OBJLoader {

    /**
     * Constructs the loader
     *
     * @param {String} filename The full path to the model OBJ file on disk
     */
    constructor(filename) {
        this.filename = filename
    }

    /**
     * Loads the file from disk and parses the geometry
     *
     * @returns {[Array<Number>, Array<Number>]} A tuple / list containing 1) the list of vertices and 2) the list of triangle indices
     */
    load() {
        let contents = loadExternalFile(this.filename);
        let vertices = []; // Will store raw sets of 3: [x,y,z, x,y,z...]
        let indices = [];
        
        const lines = contents.split('\n');

        // Parsing
        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('v ')) {
                // Flatten the array: push x, then y, then z individually
                vertices.push(...this.parseVertex(line));
            } else if (line.startsWith('f ')) {
                indices.push(...this.parseFace(line));
            }
        }

        // Normalization
        // Initialize min/max with the first vertex values
        let min = [vertices[0], vertices[1], vertices[2]];
        let max = [vertices[0], vertices[1], vertices[2]];

        // Find min and max for x, y, z
        for (let i = 0; i < vertices.length; i += 3) {
            for (let j = 0; j < 3; j++) {
                min[j] = Math.min(min[j], vertices[i + j]);
                max[j] = Math.max(max[j], vertices[i + j]);
            }
        }

        // Calculate center and max range
        let center = [
            (max[0] + min[0]) / 2,
            (max[1] + min[1]) / 2,
            (max[2] + min[2]) / 2
        ];
        
        // Find the largest dimension to scale uniformly
        let range = Math.max(
            max[0] - min[0],
            max[1] - min[1],
            max[2] - min[2]
        );

        // Apply normalization
        for (let i = 0; i < vertices.length; i += 3) {
            vertices[i] = (vertices[i] - center[0]) / (range / 2); // X
            vertices[i+1] = (vertices[i+1] - center[1]) / (range / 2); // Y
            vertices[i+2] = (vertices[i+2] - center[2]) / (range / 2); // Z
        }

        return [ vertices, indices ];
    }

    /**
     * Parses a single OBJ vertex entry given as a string
     * Call this function from OBJLoader.load()
     *
     * @param {String} vertex_string String containing the vertex entry 'v {x} {y} {z}'
     * @returns {Array<Number>} A list containing the x, y, z coordinates of the vertex
     */
    parseVertex(vertex_string) {
        // Split the string by whitespace (handles multiple spaces)
        const parts = vertex_string.trim().split(/\s+/);
        // Parse the x, y, z coordinates
        return [
            parseFloat(parts[1]),
            parseFloat(parts[2]),
            parseFloat(parts[3])
        ];
    }

    /**
     * Parses a single OBJ face entry given as a string
     * Face entries can refer to 3 or 4 elements making them triangle or quad faces
     * WebGL only supports triangle drawing, so we need to triangulate the entry if we find 4 indices
     * This is done using OBJLoader.triangulateFace()
     *
     * Each index entry can have up to three components separated by '/'
     * You need to grad the first component. The other ones are for textures and normals which will be treated later
     * Make sure to account for this fact.
     *
     * Call this function from OBJLoader.load()
     *
     * @param {String} face_string String containing the face entry 'f {v0}/{vt0}/{vn0} {v1}/{vt1}/{vn1} {v2}/{vt2}/{vn2} ({v3}/{vt3}/{vn3})'
     * @returns {Array<Number>} A list containing three indices defining a triangle
     */
    parseFace(face_string) {
        const parts = face_string.trim().split(/\s+/);
        // parts[0] is "f", the rest are indices
        const indices = [];
        
        // Loop through the components (starting at 1)
        for (let i = 1; i < parts.length; i++) {
            // Split "1/1/1" by "/" and take the first part
            const token = parts[i].split('/');
            // Parse int and subtract 1 for 0-based indexing
            indices.push(parseInt(token[0]) - 1);
        }

        // Handle Quads
        if (indices.length === 4) {
            return this.triangulateFace(indices);
        }
        
        return indices;
    }

    /**
     * Triangulates a face entry given as a list of 4 indices
     * Use these 4 indices to create indices for two separate triangles that share a side (2 vertices)
     * Return a new index list containing the triangulated indices
     *
     * @param {Array<Number>} face The quad indices with 4 entries
     * @returns {Array<Number>} The newly created list containing triangulated indices
     */
    triangulateFace(face) {
        // face contains 4 indices: [v0, v1, v2, v3]
        // Return: [v0, v1, v2, v0, v2, v3]
        return [
            face[0], face[1], face[2],
            face[0], face[2], face[3]
        ];
    }
}

export {
    OBJLoader
}
