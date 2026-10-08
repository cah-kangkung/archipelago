import * as THREE from 'three'
import { FOAM_OPACITY } from './tuning'

/** Shared by every mesh in the scene; never disposed. */
export const solidMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
})
export const ghostMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
})
export const shadowMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.2,
  depthWrite: false,
})
/** White base: the sea's colour is all in its vertex colours (spec 17.1). */
export const seaMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
})

/** The glow on plots a decoration can go on. */
export const plotMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
})
/** The decoration about to be placed. */
export const placementGhostMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  flatShading: true,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
})

/** Foam rings at every shallows edge; their opacity pulses on `high` (spec 17.5). */
export const foamMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: FOAM_OPACITY,
  depthWrite: false,
})
/** The whale's splash ring; it fades as it widens. */
export const splashMaterial = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
})
