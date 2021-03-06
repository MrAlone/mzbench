import moment from 'moment';
import { EventEmitter } from 'events';
import Dispatcher from '../dispatcher/AppDispatcher';
import ActionTypes from '../constants/ActionTypes';

const CHANGE_EVENT = 'bench_change';

const defaultData = {
    benchmarks: [],
    toggles: new Map([]),
    server_date_diff: moment.duration(0),
    filter: "",
    pager: {},
    currentPage: new Map(),
    total: 0,
    isLoaded: false,
    isNewSelected: false,
    isNewActive: false,
    clouds: [],
    newBench: {
        name: "My benchmark",
        script_name: "generic.erl",
        script_body: "#!benchDL\n" +
                     "# the simplest example\n" +
                     "pool(size = 3, # three execution \"threads\"\n" +
                     "     worker_type = dummy_worker):\n" +
                     "        loop(time = 5 min, # total loop time\n" +
                     "             rate = numvar(\"loop_rate\") rps): # one rps for every worker, 3 rps totally\n" +
                     "            print(\"FOO\") # this operation prints \"FOO\" to console\n",
        nodes: "1",
        cloud: "",
        env: [{name: "loop_rate", value: "1", id: 1}]},
    selectedBenchId: undefined,
    isShowTimelineLoadingMask: false,
    activeTab: undefined,
    activeGraph: undefined,
    timelineId: undefined
};

let data = jQuery.extend(true, {}, defaultData); // extend is used to copy object recursively

class Bench {
    constructor(props) {
        let newEnv = [];
        let currentId = 1;
        Object.assign(this, props);
        Object.keys(props.env).map((key) => newEnv.push({name: key, value: props.env[key], id: currentId++}));
        this.env = newEnv;
    }

    isRunning() {
        switch (this.status) {
            case "complete":
            case "failed":
            case "zombie":
            case "stopped":
                return false;
        }
        return true;
    }

    get start_time_client() {
        return moment(this.start_time).add(data.server_date_diff);
    }

    get finish_time_client() {
        if (this.finish_time) {
            return moment(this.finish_time).add(data.server_date_diff);
        } else {
            return undefined;
        }
    }
}

class BenchStore extends EventEmitter {
    emitChange() {
        return this.emit(CHANGE_EVENT);
    }

    onChange(callback) {
        this.on(CHANGE_EVENT, callback);
    }

    off(callback) {
        this.removeListener(CHANGE_EVENT, callback);
    }

    findById(id) {
        return data.benchmarks.find(x => x.id == id);
    }

    updateItem(bench) {
        let existBench = this.findById(bench.id);
        if (existBench) {
            Object.assign(existBench, new Bench(bench));
        } else {
            data.benchmarks.unshift(new Bench(bench));
        }
    }

    getServerDateDiff() {
        return data.server_date_diff;
    }

    loadAll(benchmarks) {
        benchmarks.sort((a, b) => b.id - a.id);
        data.benchmarks = benchmarks.map((b) => new Bench(b));
        data.isLoaded = true;
        if (!this.getSelected() && (0 < data.benchmarks.length)) {
            data.selectedBenchId = data.benchmarks[0].id;
        }
    }

    getItems() {
        return data.benchmarks;
    }

    getTimelineId() {
        return data.timelineId;
    }

    getAllTags() {
        var tags = data.benchmarks.reduce((acc, val) => {return acc.concat(val.tags)}, []);

        return tags.sort().filter(function(item, pos) {
            return tags.indexOf(item) == pos;
        })
    }

    getSelected() {
        if (!this.isLoaded() || this.isNewSelected()) {
            return undefined;
        }
        return this.findById(data.selectedBenchId);
    }

    getSelectedId() {
        return data.selectedBenchId;
    }

    getActiveTab() {
        return data.activeTab;
    }

    getSelectedGraph() {
        return data.activeGraph;
    }

    isLoaded() {
        return data.isLoaded;
    }

    isNewSelected() {
        return data.isNewSelected;
    }

    isNewActive() {
        return data.isNewActive;
    }

    getClouds() {
        return data.clouds;
    }

    getNew() {
        return data.newBench;
    }

    resetNew() {
        data.newBench = jQuery.extend(true, {}, defaultData.newBench);
    }

    cloneNewBench(id) {
        data.newBench = jQuery.extend(true, {}, this.findById(data.selectedBenchId));
    }

    isShowTimelineLoadingMask() {
        return data.isShowTimelineLoadingMask;
    }

    getFilter() {
        return data.filter;
    }

    getPager() {
        return data.pager;
    }

    getCurrentPage() {
        return data.currentPage;
    }

    getTotal() {
        return data.total;
    }

    getToggledSet(benchId) {
        if (data.toggles.has(benchId)) return new Set(data.toggles.get(benchId));
        return new Set([0]);
    }
}

var _BenchStore = new BenchStore();
export default _BenchStore;

_BenchStore.dispatchToken = Dispatcher.register((action) => {
    switch (action.type) {
        case ActionTypes.UPDATE_BENCH_INFO:
            _BenchStore.updateItem(action.data);
            _BenchStore.emitChange();
            break;

        case ActionTypes.INIT_TIMELINE:
            data.server_date_diff = moment().diff(moment(action.server_date));

            _BenchStore.loadAll(action.data);
            data.pager = action.pager;
            data.isShowTimelineLoadingMask = false;
            data.timelineId = action.timeline_id;
            data.total = action.total;

            if (data.selectedBenchId === undefined) {
                data.isNewSelected = true;
                data.isNewActive = true;
            }
            _BenchStore.emitChange();
            break;

        case ActionTypes.SELECT_BENCH_BY_ID:
            data.isNewSelected = false;
            data.selectedBenchId = parseInt(action.data);
            _BenchStore.emitChange();
            break;

        case ActionTypes.SELECT_ACTIVE_TAB:
            data.activeTab = action.data;
            _BenchStore.emitChange();
            break;

        case ActionTypes.SELECT_GRAPH:
            data.activeGraph = action.data.graphData;
            _BenchStore.emitChange();
            break;

        case ActionTypes.DESELECT_GRAPH:
            data.activeGraph = undefined;
            _BenchStore.emitChange();
            break;

        case ActionTypes.SHOW_TIMELINE_LOADING_MASK:
            data.isShowTimelineLoadingMask = true;
            _BenchStore.emitChange();
            break;

        case ActionTypes.HIDE_TIMELINE_LOADING_MASK:
            data.isShowTimelineLoadingMask = false;
            _BenchStore.emitChange();
            break;

        case ActionTypes.SET_CURRENT_PAGE:
            data.currentPage = action.data;
            break;

        case ActionTypes.SET_FILTER:
            data.filter = action.data;
            _BenchStore.emitChange();
            break;

        case ActionTypes.NEW_BENCH:
            data.selectedBenchId = undefined;
            data.isNewActive = true;
            data.isNewSelected = true;
            _BenchStore.emitChange();
            break;

        case ActionTypes.MODIFY_NEW_BENCH:
            data.isNewActive = true;
            action.data(data.newBench);
            _BenchStore.emitChange();
            break;

        case ActionTypes.CLONE_BENCH:
            data.newBench = jQuery.extend(true, {}, data.benchmarks.find(x => x.id == action.data));
            data.selectedBenchId = undefined;
            data.isNewSelected = true;
            data.isNewActive = true;
            data.currentPage = new Map();
            _BenchStore.emitChange();
            break;

        case ActionTypes.CLEAN_NEW_BENCH:
            data.newBench = jQuery.extend(true, {}, defaultData.newBench);
            if (data.clouds.length > 0) {
                data.newBench.cloud = data.clouds[0];
            }
            data.isNewActive = false;
            _BenchStore.emitChange();
            break;

        case ActionTypes.SERVER_INFO:
            data.clouds = action.data.clouds;
            if ((data.clouds.length > 0) && (data.newBench.cloud === ""))
                data.newBench.cloud = data.clouds[0];
            _BenchStore.emitChange();
            break;

        case ActionTypes.NOTIFY:
            $.notify({message: action.message}, {type: action.severity});
            break;

        case ActionTypes.SAVE_TOGGLED_GRAPHS:
            data.toggles.set(action.data.benchId, new Set(action.data.toggles));
            _BenchStore.emitChange();

        default:
    }
});

