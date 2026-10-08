import * as THREE from 'three'

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
