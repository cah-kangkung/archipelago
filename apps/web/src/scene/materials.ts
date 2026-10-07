import * as THREE from 'three'
import { scenePalette } from './model/palette'

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
export const seaMaterial = new THREE.MeshLambertMaterial({
  color: scenePalette.sea,
  flatShading: true,
})
