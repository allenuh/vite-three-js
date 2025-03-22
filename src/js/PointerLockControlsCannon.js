import * as THREE from 'three'
import * as CANNON from 'cannon-es'

const W = 'w'
const A = 'a'
const S = 's'
const D = 'd'
const SHIFT = 'shift'
const DIRECTIONS = [W, A, S, D]

/**
 * @author mrdoob / http://mrdoob.com/
 * @author schteppe / https://github.com/schteppe
 */
class PointerLockControlsCannon extends THREE.EventDispatcher {

  // state fields
  currentAction;

  // temporary data
  walkDirection = new THREE.Vector3();

  // constants 
  fadeDuration = 0.2;
  runVelocity = 5; // "factors" instead (wtf?)
  walkVelocity = 3;
    
  constructor(camera, cannonBody, model, mixer, currentAction, animationsMap) {
    super()

    this.camera = camera;
    this.enabled = false;
    this.cannonBody = cannonBody;
    this.model = model;
    this.mixer = mixer;
    this.currentAction = currentAction;
    this.animationsMap = animationsMap;
    this.animationsMap.forEach((value, key) => {
      if (key == currentAction) {
          value.play();
      }
    });

    this.offset = new THREE.Vector3(-0.65, -0.85, -2.0);

    var eyeYPos = 2 // eyes are 2 meters above the ground
    this.velocityFactor = this.walkVelocity
    this.jumpVelocity = 10

    this.pitchObject = new THREE.Object3D()
    this.pitchObject.add(camera)

    this.yawObject = new THREE.Object3D()
    this.yawObject.position.y = 2
    this.yawObject.add(this.pitchObject)

    this.quaternion = new THREE.Quaternion()

    this.moveForward = false
    this.moveBackward = false
    this.moveLeft = false
    this.moveRight = false

    this.toggleRun = false;
    this.canJump = false

    const contactNormal = new CANNON.Vec3() // Normal in the contact, pointing *out* of whatever the player touched
    const upAxis = new CANNON.Vec3(0, 1, 0)
    this.cannonBody.addEventListener('collide', (event) => {
      const { contact } = event

      // contact.bi and contact.bj are the colliding bodies, and contact.ni is the collision normal.
      // We do not yet know which one is which! Let's check.
      if (contact.bi.id === this.cannonBody.id) {
        // bi is the player body, flip the contact normal
        contact.ni.negate(contactNormal)
      } else {
        // bi is something else. Keep the normal as it is
        contactNormal.copy(contact.ni)
      }

      // If contactNormal.dot(upAxis) is between 0 and 1, we know that the contact normal is somewhat in the up direction.
      if (contactNormal.dot(upAxis) > 0.5) {
        // Use a "good" threshold value between 0 and 1 here!
        this.canJump = true
      }
    })

    this.velocity = this.cannonBody.velocity

    // Moves the camera to the cannon.js object position and adds velocity to the object if the run key is down
    this.inputVelocity = new THREE.Vector3()
    this.euler = new THREE.Euler()

    this.lockEvent = { type: 'lock' }
    this.unlockEvent = { type: 'unlock' }

    this.connect()
  }

  connect() {
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onPointerlockChange)
    document.addEventListener('pointerlockerror', this.onPointerlockError)
    document.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('keyup', this.onKeyUp)
  }

  disconnect() {
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onPointerlockChange)
    document.removeEventListener('pointerlockerror', this.onPointerlockError)
    document.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('keyup', this.onKeyUp)
  }

  dispose() {
    this.disconnect()
  }

  lock() {
    document.body.requestPointerLock()
  }

  unlock() {
    document.exitPointerLock()
  }

  onPointerlockChange = () => {
    if (document.pointerLockElement) {
      this.dispatchEvent(this.lockEvent)

      this.isLocked = true
    } else {
      this.dispatchEvent(this.unlockEvent)

      this.isLocked = false
    }
  }

  onPointerlockError = () => {
    console.error('PointerLockControlsCannon: Unable to use Pointer Lock API')
  }

  onMouseMove = (event) => {
    if (!this.enabled) {
      return
    }

    const { movementX, movementY } = event

    this.yawObject.rotation.y -= movementX * 0.0005
    this.pitchObject.rotation.x -= movementY * 0.0005
    
    // the pitch, or up & down camera can't go past "legs" or "head"
    this.pitchObject.rotation.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this.pitchObject.rotation.x))

    // console.log(this.thirdPersonCamera); 
  }

  onKeyDown = (event) => {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = true
        break

      case 'KeyA':
      case 'ArrowLeft':
        this.moveLeft = true
        break

      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = true
        break

      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = true
        break

      case 'Space':
        if(this.isLocked){
          if (this.canJump) {
            this.velocity.y = this.jumpVelocity
          }
          this.canJump = false
          break
        }
        break
      case 'ShiftLeft':
        this.switchRunToggle();
        if (this.toggleRun){
          this.velocityFactor = this.runVelocity;
        }
        else{
          this.velocityFactor = this.walkVelocity;
        }
        break
    }
  }

  onKeyUp = (event) => {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = false
        break

      case 'KeyA':
      case 'ArrowLeft':
        this.moveLeft = false
        break

      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = false
        break

      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = false
        break
    }
  }

  switchRunToggle() {
    this.toggleRun = !this.toggleRun;
  }

  getObject() {
    return this.yawObject
  }

  getDirection() {
    const vector = new CANNON.Vec3(0, 0, -1)
    vector.applyQuaternion(this.quaternion)
    return vector
  }

  update(delta) {
    if (this.enabled === false) {
      return
    }

    // Animations
    var play = ''
    if ( (this.moveForward || this.moveLeft || this.moveBackward || this.moveRight) && this.toggleRun) {
        play = 'Run'
    } else if (this.moveForward || this.moveLeft || this.moveBackward || this.moveRight) {
        play = 'Walk'
    } else {
        play = 'Idle'
    }

    if (this.currentAction != play) {
      const toPlay = this.animationsMap.get(play);
      const current = this.animationsMap.get(this.currentAction);

      current.fadeOut(this.fadeDuration);
      toPlay.reset().fadeIn(this.fadeDuration).play();

      this.currentAction = play;
    }

    this.mixer.update(delta);

    delta *= 1000
    delta *= 0.1

    this.inputVelocity.set(0, 0, 0)

    if (this.moveForward) {
      this.inputVelocity.z = -this.velocityFactor * delta
    }
    if (this.moveBackward) {
      this.inputVelocity.z = this.velocityFactor * delta
    }

    if (this.moveLeft) {
      this.inputVelocity.x = -this.velocityFactor * delta
    }
    if (this.moveRight) {
      this.inputVelocity.x = this.velocityFactor * delta
    }

    // Convert velocity to world coordinates
    this.euler.x = this.pitchObject.rotation.x
    this.euler.y = this.yawObject.rotation.y
    this.euler.order = 'XYZ'
    this.quaternion.setFromEuler(this.euler)
    this.inputVelocity.applyQuaternion(this.quaternion)

    // Add to the object
    const smoothingFactor = 0.1; // Adjust for smoother transitions
    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, this.inputVelocity.x, smoothingFactor);
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, this.inputVelocity.z, smoothingFactor);


    // Update model position with cannon body position
    this.model.position.copy(this.cannonBody.position)
    this.model.position.y -= 0.7;

    this.yawObject.position.copy(this.cannonBody.position)
    this.cannonBody.quaternion.copy(this.yawObject.quaternion)
    this.model.quaternion.copy(this.yawObject.quaternion)

    // Third Person Camera
    const cameraQuaternion = new THREE.Quaternion(); // Quaternion representing the yaw rotation of camera
    const cameraRotation = new THREE.Euler(this.pitchObject.rotation.x, this.yawObject.rotation.y, 0, 'YXZ');
    cameraQuaternion.setFromEuler(cameraRotation);

    const rotatedOffset = this.offset.clone().applyQuaternion(cameraQuaternion);

    // Update the yawObject's position by subtracting the total offset
    this.yawObject.position.copy(this.cannonBody.position).sub(rotatedOffset);
  }
}

export { PointerLockControlsCannon }