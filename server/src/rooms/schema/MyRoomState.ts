import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") z: number = 0;
  @type("number") angleY: number = 0;
  @type("number") animX: number = 0;
  @type("number") animZ: number = 0;
  @type("number") team: number = 0;
  @type("number") hp: number = 100;
  @type("boolean") alive: boolean = true;
}

export class Enemy extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") z: number = 0;
  @type("number") hp: number = 100;
  @type("number") maxHp: number = 100;
  @type("boolean") alive: boolean = true;
  @type("number") wave: number = 1;
  @type("number") team: number = 2;  // 1=藍方小兵(北上), 2=紅方小兵(南下)
}

export class MyRoomState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Enemy }) enemies = new MapSchema<Enemy>();
  @type("number") wave: number = 0;
  @type("boolean") waveActive: boolean = false;
  @type("number") keepHp1: number = 1000;  // 藍方主堡 (south z=34)
  @type("number") keepHp2: number = 1000;  // 紅方主堡 (north z=-65)
  @type("number") maxKeepHp: number = 1000;
}
