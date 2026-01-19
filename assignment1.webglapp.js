
import { hex2rgb, deg2rad, loadExternalFile } from './js/utils/utils.js'
import Input from './js/input/input.js'
import * as mat4 from './js/lib/glmatrix/mat4.js'
import * as vec3 from './js/lib/glmatrix/vec3.js'
import * as quat4 from './js/lib/glmatrix/quat.js'
import { Box } from './js/app/object3d.js'

import { Scene, SceneNode } from './assignment1.scene.js'

/**
 * @Class
 * WebGlApp that will call basic GL functions, manage camera settings, transformations and scenes, and take care of rendering them
 *
 */
class WebGlApp
{
    /**
     * Initializes the app with a box, and a scene, view, and projection matrices
     *
     * @param {WebGL2RenderingContext} gl The webgl2 rendering context
     * @param {Shader} shader The shader to be used to draw the object
     * @param {AppState} app_state The state of the UI
     */
    constructor( gl, shader, app_state )
    {
        // Set GL flags
        this.setGlFlags( gl )

        // Store the shader
        this.shader = shader

        // Create a box instance
        this.box = new Box( gl, shader )

        // Declare a variable to hold a Scene
        // Scene files can be loaded through the UI (see below)
        this.scene = null

        // Bind a callback to the file dialog in the UI that loads a scene file
        app_state.onOpen3DScene((filename) => {
            let scene_config = JSON.parse(loadExternalFile(`./scenes/${filename}`))
            this.scene = new Scene(scene_config, gl, shader)
            return this.scene
        })

        // Create the view matrix
        this.eye     =   [2.0, 0.5, -2.0]
        this.center  =   [0, 0, 0]

        this.forward =   null
        this.right   =   null
        this.up      =   null

        // Forward, Right, and Up are initialized based on Eye and Center
        this.updateViewSpaceVectors()

        // VIEW MATRIX
        this.view = mat4.create()
        mat4.lookAt(this.view, this.eye, this.center, this.up)

        // Create the projection matrix
        // TODO: Create values the projection matrix
        // TODO: The projection should have a vertical field of view of 60
        // TODO: It should have an 16:9 aspect rotation
        // TODO: Define appropriate values for the near and far plane distance so that the whole scene is visible
        // PROJECTION MATRIX
        this.projection = mat4.create()

        // FOV 60 degrees in radians, Aspect Ratio 16/9, Near 0.1, Far 100.0
        mat4.perspective(this.projection, deg2rad(60), 16/9, 0.1, 100.0)

        // Use the shader's setUniform4x4f function to pass the matrices
        this.shader.use()
        this.shader.setUniform4x4f('u_v', this.view)
        this.shader.setUniform4x4f('u_p', this.projection)
        this.shader.unuse()

    }

    /**
     * Sets up GL flags
     * In this assignment we are drawing 3D data, so we need to enable the flag
     * for depth testing. This will prevent from geometry that is occluded by other
     * geometry from 'shining through' (i.e. being wrongly drawn on top of closer geomentry)
     *
     * Look into gl.enable() and gl.DEPTH_TEST to learn about this topic
     *
     * @param {WebGL2RenderingContext} gl The webgl2 rendering context
     */
    setGlFlags( gl ) {

        // Enable depth test
        gl.enable(gl.DEPTH_TEST)

    }

    /**
     * Sets the viewport of the canvas to fill the whole available space so we draw to the whole canvas
     *
     * @param {WebGL2RenderingContext} gl The webgl2 rendering context
     * @param {Number} width
     * @param {Number} height
     */
    setViewport( gl, width, height )
    {
        gl.viewport( 0, 0, width, height )
    }

    /**
     * Clears the canvas color
     *
     * @param {WebGL2RenderingContext} gl The webgl2 rendering context
     */
    clearCanvas( gl )
    {
        gl.clearColor(...hex2rgb('#000000'), 1.0)
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    }

    /**
     * Updates components of this app
     *
     * @param {WebGL2RenderingContext} gl The webgl2 rendering context
     * @param {AppState} app_state The state of the UI
     * @param {Number} delta_time The time in seconds since the last frame (floating point number)
     */
    update( gl, app_state, delta_time )
    {
        // Draw Mode
        //throw '"WebGlApp.update" not complete'

        if (this.scene != null) {
            // Get the draw mode from the UI
            let drawModeState = app_state.getState('Draw Mode')
            let mode = gl.TRIANGLES
            if (drawModeState === 'Points') {
                mode = gl.POINTS
            }

            // Iterate through all nodes
            let nodes = this.scene.getNodes()
            for (let node of nodes) {
                // Only set draw mode if it is a ModelNode (which has geometry)
                // We check this by seeing if the method setDrawMode exists
                if (node.setDrawMode) {
                    node.setDrawMode(mode)
                }
            }
        }

        // Control
        switch(app_state.getState('Control')) {
            case 'Camera':
                this.updateCamera( delta_time )
                break
            case 'Scene Node':
                // Only do this if a scene is loaded
                if (this.scene == null)
                    break

                // Get the currently selected scene node from the UI
                let scene_node = this.scene.getNode( app_state.getState('Select Scene Node') )
                this.updateSceneNode( scene_node, delta_time )
                break
        }
    }

    /**
     * Update the Forward, Right, and Up vector according to changes in the
     * camera position (Eye) or the center of focus (Center)
     */
    updateViewSpaceVectors( ) {
        this.forward = vec3.normalize(vec3.create(), vec3.sub(vec3.create(), this.eye, this.center))
        this.right = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), [0,1,0], this.forward))
        this.up = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), this.forward, this.right))
    }

    /**
     * Update the camera view based on user input and the arcball viewing model
     *
     * Supports the following interactions:
     * 1) Left Mouse Button - Rotate the view's center
     * 2) Middle Mouse Button or Space+Left Mouse Button - Pan the view relative view-space
     * 3) Right Mouse Button - Zoom towards or away from the view's center
     *
     * @param {Number} delta_time The time in seconds since the last frame (floating point number)
     */
    updateCamera( delta_time ) {
        let view_dirty = false

        // Control - Zoom
        if (Input.isMouseDown(2)) {
            // Zoom: Move eye along the forward vector
            let zoomSpeed = 2.0 * delta_time
            let dy = Input.getMouseDy()
            
            // Calculate direction from center to eye
            let direction = vec3.create()
            vec3.subtract(direction, this.eye, this.center)
            
            // Scale direction based on input
            // If dy is positive (mouse down), we zoom out (scale > 1)
            // If dy is negative (mouse up), we zoom in (scale < 1)
            let scaleFactor = 1.0 + (dy * zoomSpeed)
            
            // Apply scale and update eye
            vec3.scaleAndAdd(this.eye, this.center, direction, scaleFactor)

            view_dirty = true
        }

        // Control - Rotate
        if (Input.isMouseDown(0) && !Input.isKeyDown(' ')) {
            let sensitivity = 2.0 * delta_time // Rotation speed
            let dx = Input.getMouseDx()
            let dy = Input.getMouseDy()

            // Create a vector from Center to Eye
            let offset = vec3.create()
            vec3.subtract(offset, this.eye, this.center)

            // Rotate around Up axis (Yaw) - controlled by Mouse X
            let rotationY = mat4.create()
            // Note: We use this.up (camera up) for intuitive rotation
            mat4.fromRotation(rotationY, -dx * sensitivity, this.up)
            vec3.transformMat4(offset, offset, rotationY)

            // Rotate around Right axis (Pitch) - controlled by Mouse Y
            let rotationX = mat4.create()
            mat4.fromRotation(rotationX, -dy * sensitivity, this.right)
            vec3.transformMat4(offset, offset, rotationX)

            // Update Eye position
            vec3.add(this.eye, this.center, offset)

            view_dirty = true
        }

        // Control - Pan
        if (Input.isMouseDown(1) || (Input.isMouseDown(0) && Input.isKeyDown(' '))) {
            let panSpeed = 2.0 * delta_time
            let dx = Input.getMouseDx()
            let dy = Input.getMouseDy()

            // Calculate pan vector: -dx * Right + dy * Up
            let p = vec3.create()
            vec3.scaleAndAdd(p, p, this.right, -dx * panSpeed)
            vec3.scaleAndAdd(p, p, this.up, dy * panSpeed)

            // Apply to both Eye and Center
            vec3.add(this.eye, this.eye, p)
            vec3.add(this.center, this.center, p)

            view_dirty = true
        }

        // Update view matrix if needed
        if (view_dirty) {
            this.updateViewSpaceVectors()
            mat4.lookAt(this.view, this.eye, this.center, this.up)
            
            this.shader.use()
            this.shader.setUniform4x4f('u_v', this.view)
            this.shader.unuse()
        }
    }

    /**
     * Update a SceneNode's local transformation
     *
     * Supports the following interactions:
     * 1) Left Mouse Button - Rotate the node relative to the view along the Up and Right axes
     * 2) Middle Mouse Button or Space+Left Mouse Button - Translate the node relative to the view along the Up and Right axes
     * 3) Right Mouse Button - Scales the node around it's local center
     *
     * @param {SceneNode} node The SceneNode to manipulate
     * @param {Number} delta_time The time in seconds since the last frame (floating point number)
     */
    updateSceneNode( node, delta_time ) {
        let node_dirty = false

        let translation = mat4.create()
        let rotation = mat4.create()
        let scale = mat4.create()

        // Control - Scale
        if (Input.isMouseDown(2)) {
            let s = 1.0 + (Input.getMouseDy() * delta_time)
            
            // Create scaling matrix
            mat4.fromScaling(scale, [s, s, s])
            
            node_dirty = true
        }

        // Control - Rotate
        if (Input.isMouseDown(0) && !Input.isKeyDown(' ')) {
            let sensitivity = 2.0 * delta_time
            let dx = Input.getMouseDx()
            let dy = Input.getMouseDy()

            // Rotate around Camera Up and Camera Right
            let rotY = mat4.create()
            mat4.fromRotation(rotY, dx * sensitivity, this.up)

            let rotX = mat4.create()
            mat4.fromRotation(rotX, dy * sensitivity, this.right)

            // Combine rotations: rotation = rotY * rotX
            mat4.multiply(rotation, rotY, rotX)
            
            node_dirty = true
        }

        // Control - Translate
        if (Input.isMouseDown(1) || (Input.isMouseDown(0) && Input.isKeyDown(' '))) {
            let speed = 5.0 * delta_time // Translation speed
            let dx = Input.getMouseDx()
            let dy = Input.getMouseDy()

            // Translate along Camera Right and Camera Up
            let t = vec3.create()
            vec3.scaleAndAdd(t, t, this.right, dx * speed)
            vec3.scaleAndAdd(t, t, this.up, -dy * speed)

            mat4.fromTranslation(translation, t)

            node_dirty = true
        }


        // Update node transformation if needed
        if (node_dirty) {
            let transformation = node.getTransformation()

            // Apply transformations
            
            // View-Relative Translation (Pre-Multiply)
            // T_new = Translation * T_old
            mat4.multiply(transformation, translation, transformation)

            // View-Relative Rotation (Pre-Multiply)
            // T_new = Rotation * T_old
            mat4.multiply(transformation, rotation, transformation)

            // Local Scaling (Post-Multiply)
            // T_new = T_old * Scale
            mat4.multiply(transformation, transformation, scale)

            // Update the node's transformation
            node.setTransformation(transformation)
        }
    }

    /**
     * Main render loop which sets up the active viewport (i.e. the area of the canvas we draw to)
     * clears the canvas with a background color and draws the scene
     *
     * @param {WebGL2RenderingContext} gl The webgl2 rendering context
     * @param {Number} canvas_width The canvas width. Needed to set the viewport
     * @param {Number} canvas_height The canvas height. Needed to set the viewport
     */
    render( gl, canvas_width, canvas_height )
    {
        // Set viewport and clear canvas
        this.setViewport( gl, canvas_width, canvas_height )
        this.clearCanvas( gl )

        // Render the box
        // This will use the MVP that was passed to the shader
        this.box.render( gl )

        // Render the scene
        if (this.scene) this.scene.render( gl )
    }

}

export {
    WebGlApp
}
