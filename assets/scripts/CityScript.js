var TankType = require("TankData").tankType;
var app = require("app");
cc.Class({
    extends: cc.Component,

    properties: {

        //地图
        curMap: cc.TiledMap,

        //关卡地图
        curTiledMap: [cc.TiledMapAsset],

        //摇杆
        yaogan: cc.Node,

        //发射器
        qiang: cc.Node,

        //子弹预制体
        bullet: cc.Prefab,
        //坦克预制体
        tank: {
            default: null,
            type: cc.Prefab,
        },
        //场上一次性出现最大数量
        maxCount: 5,

        //一句敌机最大数量
        maxDIJiCount: 10,

        //一句时间
        maxTime: 300,

        //出生地
        bornPoses: {
            default: [],
            type: cc.Vec2,
        },
        //坦克皮肤
        spriteFrames: {
            default: [],
            type: cc.SpriteFrame,
        },
        //坦克移动速度
        tankSpeeds: {
            default: [],
            type: cc.Float,
        },
        //坦克子弹发射间隔时间
        tankFireTimes: {
            default: [],
            type: cc.Float,
        },

        //坦克血量
        tankBloods: {
            default: [],
            type: cc.Integer,
        },

        //分数
        score: cc.Label,

        //敌机数量
        dijiNum: cc.Label,

        //倒计时
        timeNum: cc.Label,

    },

    // use this for initialization
    onLoad: function () {
        cc.director.setDisplayStats(true);

        this.LocalDataManager = app.LocalDataManager();
        this.level = this.LocalDataManager.GetConfigProperty("SysSetting","choeseLevel");
        //获取摇杆控制组件
        this._joystickCtrl = this.yaogan.getComponent("JoystickCtrl");
        //获枪组件
        this._qiangCtrl = this.qiang.getComponent("QiangCtrl");
        //获取地图 TiledMap 组件
        this._tiledMap = this.curMap.getComponent('cc.TiledMap');
        
        this._tiledMap.tmxAsset = this.curTiledMap[this.level-1];

        this.shengchanInit = 0;

        this.time = 0;
        this.initScore();

    },

    start: function(err){
        if(err){
            return;
        }

        //默认角度
        this.curAngle = null;

        var self = this;
        //注册监听事件
        this.registerInputEvent();
        //引入地图数据
        this._tiledMapData = require("TiledMapData");

        //获取地图尺寸
        this._curMapTileSize = this._tiledMap.getTileSize();
        this._curMapSize = cc.v2(this._tiledMap.node.width,this._tiledMap.node.height);
        
        //地图墙层
        this.mapLayer0 = this._tiledMap.getLayer("layer_0");

        //初始化对象池(参数必须为对应脚本的文件名)
        this.bulletPool = new cc.NodePool("BulletScript");
        var initBulletCount = 20;
        for(var i=0; i<initBulletCount; ++i){
            var bullet = cc.instantiate(this.bullet);
            this.bulletPool.put(bullet);
        }
        this.tankPool = new cc.NodePool("TankScript");
        for(var i=0; i<this.maxCount; ++i){
            var tank = cc.instantiate(this.tank);
            this.tankPool.put(tank);
        }
        if(!cc.gameData){
            cc.gameData = {};
        }
        //初始化
        cc.gameData.teamId = 0;
        //临时
        cc.gameData.single = true;

        //地图内坦克列表
        cc.gameData.tankList = [];
        //地图内子弹列表
        cc.gameData.bulletList = [];

        //获取组件
        this.tankNode = cc.find("/Canvas/Map/tank");
        //加入player
        this.player = this.addPlayerTank();
        //获取坦克控制组件
        this._playerTankCtrl = this.player.getComponent("TankScript"); 

        //启动定时器，添加坦克
        this.schedule(this.addAITank,3,cc.macro.REPEAT_FOREVER,1);
        
    },

    //注册输入事件
    registerInputEvent: function () {

        var self = this;

        this._joystickCtrl.addJoyStickTouchChangeListener(function (angle) {
            
            if(angle == self.curAngle &&
                !self._playerTankCtrl.stopMove ){
                return;
            }
            self.curAngle = angle;

            if(angle!=null){
                //开始前进
                self._playerTankCtrl.tankMoveStart(angle);
            }else {
                //停止前进
                self._playerTankCtrl.tankMoveStop();
            }

        });

        this._qiangCtrl.addQiangTouchChangeListener(function (isKaiQiang) {

            if (isKaiQiang) {
                if (self._playerTankCtrl.startFire(self.bulletPool)) {
                    //播放射击音效
                    cc.audioEngine.play(self._playerTankCtrl.shootAudio, false, 1);
                }
            }
            

        });


        //按键按下
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, 
                        function (event) {
                            var angle = null;
                            switch (event.keyCode) {
                                case cc.KEY.up:
                                    angle = 90;
                                    break;
                                case cc.KEY.down:
                                    angle = 270;
                                    break;
                                case cc.KEY.left:
                                    angle = 180;
                                    break;
                                case cc.KEY.right:
                                    angle = 0;
                                    break;
                            }
                            if(event.keyCode == cc.KEY.s){
                                this.fireBtnClick();
                            }else {
                                self._playerTankCtrl.tankMoveStop();
                            }
                            if(angle!=null){
                                //开始前进
                                self._playerTankCtrl.tankMoveStart(angle);
                            }
                        }, this);
        //按键抬起aaaa啊啊啊啊啊
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP, 
                        function (event){
                            //停止前进
                            if(event.keyCode != cc.KEY.s){
                                self._playerTankCtrl.tankMoveStop();
                            }
                        }, this);

    },

    //碰撞检测
    collisionTest: function(rect, bullet){
        //判断是否碰到地图边界
        if (rect.xMin <= -this._curMapSize.x/2 || rect.xMax >= this._curMapSize.x/2 ||
		    rect.yMin <= -this._curMapSize.y/2 || rect.yMax >= this._curMapSize.y/2){
                
            return true;
        }
        //判断是否撞墙
        //将坐标转换为地图坐标系
        var MinY = this._curMapSize.y/2 - rect.yMin;
	    var MaxY = this._curMapSize.y/2 - rect.yMax;
        var MinX = this._curMapSize.x/2 + rect.xMin;
        var MaxX = this._curMapSize.x/2 + rect.xMax;

        //获取四个角的顶点
        var LeftDown = cc.v2(MinX, MinY);
        var RightDown = cc.v2(MaxX, MinY);
        var LeftUp = cc.v2(MinX, MaxY);
        var RightUp = cc.v2(MaxX, MaxY);

        //获取四条边的中心点
        var MidDown = cc.v2(MinX+(MaxX-MinX)/2, MinY);
        var MidUp = cc.v2(MinX+(MaxX-MinX)/2, MaxY);
        var MidLeft = cc.v2(MinX, MinY+(MaxY-MinY)/2);
        var MidRight= cc.v2(MaxX, MinY+(MaxY-MinY)/2);

        //检测碰撞
        return this._collisionTest([LeftDown,RightDown,LeftUp,RightUp,
                        MidDown,MidUp,MidLeft,MidRight],
                        bullet);
    },

    //内部碰撞检测方法
    _collisionTest: function(points, bullet){
        var point = points.shift()
        var gid = this.mapLayer0.getTileGIDAt(cc.v2(parseInt(point.x / this._curMapTileSize.width),parseInt(point.y / this._curMapTileSize.height)));
        if (this._tiledMapData.gidToTileType[gid] != this._tiledMapData.tileType.tileNone && 
            this._tiledMapData.gidToTileType[gid] != this._tiledMapData.tileType.tileGrass){
            if(bullet && this._tiledMapData.gidToTileType[gid] == this._tiledMapData.tileType.tileWall){
                this.mapLayer0.removeTileAt(cc.v2(parseInt(point.x / this._curMapTileSize.width),parseInt(point.y / this._curMapTileSize.height)));
            }
            return true;
        }
        if(points.length>0){
            return this._collisionTest(points, bullet);
        }else{
            return false;
        }
    },

    //加入玩家坦克
    addPlayerTank: function(team) {
        if(this.tankPool.size()>0){
            var tank = this.tankPool.get();
            tank.getComponent(cc.Sprite).spriteFrame = this.spriteFrames[this.spriteFrames.length-1];
            tank.position = this.bornPoses[this.bornPoses.length-1];
            //获取坦克控制组件
            var tankCtrl = tank.getComponent("TankScript");
            //设置坦克属性
            tankCtrl.tankType = TankType.Player;
            tankCtrl.speed = this.tankSpeeds[this.tankSpeeds.length-1];
            tankCtrl.fireTime = this.tankFireTimes[this.tankFireTimes.length-1];
            tankCtrl.blood = this.tankBloods[this.tankBloods.length-1];
            tankCtrl.die = false;
            
            if(!team){
                if(cc.gameData.single){
                    //单机版
                    tankCtrl.team = 0;
                }else {
                    //大乱斗
                    tankCtrl.team = ++cc.gameData.teamId;
                }
                
            }else {
                //组队
                tankCtrl.team = team;
            }

            tank.parent = this.tankNode;
            //加到列表
            cc.gameData.tankList.push(tank);
            return tank;
        }
        return null;
    },

    //加入AI
    addAITank: function(dt, team) {


        let isShengChan = this.shengchanInit < this.maxDIJiCount;

        //cc.log("isShengChan",isShengChan,"this.tankPool.size()",this.tankPool.size());
        if(this.tankPool.size()>0 && isShengChan && this.maxDIJiCount > 0){
            var tank = this.tankPool.get();
            this.shengchanInit += 1;
            //cc.log("场上敌机",this.shengchanInit);
            var index = parseInt(Math.random()*3, 10);
            //获取坦克控制组件
            var tankCtrl = tank.getComponent("TankScript");
            //设置坦克属性
            tank.getComponent(cc.Sprite).spriteFrame = this.spriteFrames[index];
            tank.position = this.bornPoses[index];

            tankCtrl.tankType = index;
            tankCtrl.speed = this.tankSpeeds[index];
            tankCtrl.fireTime = this.tankFireTimes[index];
            tankCtrl.blood = this.tankBloods[index];
            tankCtrl.die = false;

            if(!team){
                if(cc.gameData.single){
                    //单机版
                    tankCtrl.team = 1;
                }else {
                    //大乱斗
                    tankCtrl.team = ++cc.gameData.teamId;
                }
            }else {
                //组队
                tankCtrl.team = team;
            }

            if(index == 0){
                tank.rotation = 90;
            }else if(index == 1){
                tank.rotation = 180;
            }else if(index == 2){
                tank.rotation = 270;
            }
            if(tankCtrl.collisionTank(tank.getBoundingBox())){
                for(var i=0; i<this.bornPoses.length-1; i++){
                    tank.position = this.bornPoses[i];
                    if(!tankCtrl.collisionTank(tank.getBoundingBox())){
                        break;
                    }
                }
            }

            tank.parent = this.tankNode;
            //加到列表
            cc.gameData.tankList.push(tank);
        }
    },

    tankBoom: function(tank) {

        
        tank.getComponent("TankScript").die = true;

        if(cc.isValid(tank)){

            tank.parent = null;
            this.tankPool.put(tank);
        }

        cc.gameData.tankList.splice(this.checkTank(tank),1);

        this.checkScore(1,1);
        this.shengchanInit -= 1;
        if(cc.gameData.single && tank.getComponent("TankScript").team == 0){
            cc.director.loadScene("StartScene");
        }
        if (this.maxDIJiCount == 0){
            cc.director.loadScene("ChoiceScene");
        }
    },

    //开火按钮点击
    fireBtnClick: function(){
        if(this._playerTankCtrl.startFire(this.bulletPool)){
            //播放射击音效
            cc.audioEngine.play(this._playerTankCtrl.shootAudio, false, 1);
        }
    },

    //初始化分数
    initScore:function () {
        this.score.string = "分数：" + "0";
        this.dijiNum.string = "敌机：" + (this.maxDIJiCount);
        this.timeNum.string = "时间：" + (this.maxTime);
    },

    //计算分数
    checkScore:function (score,num) {
        let agoScore = this.score.string.slice(3,this.score.string.length);
        agoScore = parseInt(agoScore) + score;
        let agodijiNum = this.dijiNum.string.slice(3,this.dijiNum.string.length);
        this.score.string = "分数：" + (agoScore);
        this.dijiNum.string = "敌机：" + (agodijiNum-num);
        this.maxDIJiCount -=num;
    },

    checkTank:function (tank) {
        for(let i = 0;i < cc.gameData.tankList.length; ++i){
            if (cc.gameData.tankList[i] == tank){
                return i;
            }
        }
        return -1;
    },

    // called every frame, uncomment this function to activate update callback
    update: function (dt) {

        this.time += dt;
        if (this.time > 1){
            this.timeNum.string = "时间：" + (this.maxTime--);
            this.time = 0;
        }

        if (this.maxTime < 0){
            cc.director.loadScene("StartScene");
        }

    },

    //销毁时调用
    onDestroy: function () {
        this.unschedule(this.addAITank,this);
    },
});
