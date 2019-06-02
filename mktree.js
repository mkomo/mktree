let time = Date.now();
function debug(...args) {
  let elapsed = Date.now() - time;
  let elapsedString = elapsed > 1000000 ? '...    ' : (('     ' + elapsed).slice(-6) + '  ')
  time = Date.now();
  console.log(elapsedString, ...args);
}
/*
Node: id, type, data, provenance
  TreeNode: parent, children
Edge: sourceNodeId, destNodeId, getId()(derived from source and dest), edgeType (directional, non), data, provenance
Graph: name, subGraphs, nodes, edges
  DirectedGraph
    DAG
      Forest
        Tree
GraphView: graph, nodeFilters, edgeFilters, nodeFiltersActive, edgeFiltersActive, nodeViews, edgeViews, groupNodeViews, groupEdgeViews, cliqueViews
  ForestView:
    TreeView:
NodeView: nodeId, x, y, radius, label, focusTypes
EdgeView: edgeId
GroupNodeView: nodeIds, radius
GroupEdgeView: sourceNodeId, destNodeIds...
CliqueView: nodeIds, ...
EditableGraphView: nodeViews,
*/

//The innards of a node should be immutable in order to maintain some sense of sanity
class MkNode {
  constructor(props) {
    this.state = {};
    this.state.id = props.id;
    this.state.graph = props.graph;
    this.state.attributes = props.attributes || {};

    this.state.graph.addNode(this);
  }

  getFilters() {
    return this.getGraph().getFilters();
  }

  getExcludingFilters() {
    let filters = this.getFilters();
    return Object.keys(filters).filter(filterName => !filters[filterName](this));
  }

  //about this node
  getId(){
    return this.state.id;
  }

  getAttributes(){
    return this.state.attributes;
  }

  getAttribute(attr){
    return this.state.attributes[attr];
  }

  getGraph() {
    return this.state.graph;
  }

  isIncludedSelf() {
    return Object.values(this.getFilters()).reduce((acc, f) => (acc && f(this)), true);
  }

  toString() {
    return this.getId();
  }
}

class MkEdge {
  constructor(props, source, destination) {
    this.source = source;
    this.destination = destination;
    this.state = {};
    this.state.id = props.id;
    this.state.graph = props.graph;
    this.state.attributes = props.attributes || {};

    this.state.graph.addEdge(this);
  }

  getFilters() {
    return this.getGraph().getFilters();
  }

  getExcludingFilters() {
    let filters = this.getFilters();
    return Object.keys(filters).filter(filterName => !filters[filterName](this));
  }

  //about this node
  getId(){
    return this.state.id;
  }

  getAttributes(){
    return this.state.attributes;
  }

  getGraph() {
    return this.state.graph;
  }

  isIncludedSelf() {
    return Object.values(this.getFilters()).reduce((acc, f) => (acc && f(this)), true);
  }

  toString() {
    return this.getId();
  }
}

class MkTreeNode extends MkNode {
  constructor(props) {
    super(props);
    this.state.parent = props.parent || null;
    this.state.children = [];
    this.weight = {};
  }

  isIncluded() {
    return this.isIncludedSelf() || this.isIncludedBecauseOfDescendent();
  }

  isIncludedBecauseOfDescendent() {
    return this.getFirst(node=>{
      return node.isIncludedSelf();
    }, false) !== null;
  }

  //change relationships of node
  setParent(node) {
    this.state.parent = node;
  }

  addChild(node, index = null) {
    if (index === null) {
      this.state.children.push(node);
    } else {
      this.state.children.splice(index, 0, node);
    }
    node.setParent(this);
  }

  sortChildren(sortFunction) {
    return this.state.children.sort(sortFunction);
  }

  //descending
  getChildren(unfiltered = false) {
    return this.state.children.filter(c => unfiltered || (c.isIncluded()));
  }

  getDescendents(unfiltered = false) {
    let collector = [];
    let self = this;
    this.dft((node) => {
      if (node !== self) {
        collector.push(node);
      }
    }, unfiltered);
    return collector;
  }

  getDescendentsAtLevel(level, unfiltered = false) {
    let collector = [];
    let self = this;
    this.dft((node) => {
      if (node.getRootDistance() == level) {
        collector.push(node);
        return false;
      }
    }, unfiltered);
    return collector;
  }

  getMaxDepth(unfiltered = false) {
    let children = this.getChildren(unfiltered)
    if (children.length == 0) {
      return 0;
    } else {
      return 1 + children.map(n => n.getMaxDepth(unfiltered)).reduce(( max, cur ) => Math.max( max, cur ), 0);
    }
  }

  dft(func, unfiltered = false, ref = null) {
    if (unfiltered || this.isIncluded()) {
      let shouldContinue = func.call(ref, this);
      if (shouldContinue !== false) {
        this.getChildren(unfiltered).forEach(c => {
          c.dft(func, unfiltered, ref);
        });
      }
    }
  }

  weigh(label='DEFAULT', unfiltered = false) {
    this.weight[label] = (unfiltered || this.isIncluded()) ? this.getWeightOfSelf() : 0;
    this.getChildren(true).forEach(c => {
      c.weigh(label, unfiltered);
      this.weight[label] += c.weight[label];
    });
  }



  getFirst(predicate, includeSelf = true) {
    let value = (includeSelf && predicate.call(this, this)) ? this : null;
    if (value === null) {
      let children = this.getChildren(true);
      for (let index in children){
        value = children[index].getFirst(predicate);
        if (value !== null) {
          return value;
        }
      }
    }
    return value;
  }

  //at level
  getLevelNodes(root = this.getRoot(), unfiltered = false) {
    return root.getDescendentsAtLevel(this.getRootDistance(), unfiltered);
  }

  //weights
  //keep public
  getWeightOfSelf() {
    return 1; //TODO allow overriding
  }

  //deprecate
  getWeightStatsOfParent(root = this.getRoot(), label='DEFAULT') {
    let generationWeight = 0;
    let olderSiblingWeight = 0;
    let myWeight;
    if (this.isRoot(root)) {
      myWeight = this.weight[label];
      generationWeight = myWeight;
    } else {
      let counted = false;
      this.getParent().getChildren(true).forEach(sibling => {
        let sibWeight = label in sibling.weight ? sibling.weight[label] : 0;
        if (sibling === this) {
          counted = true;
          myWeight = sibWeight;
        }
        generationWeight += sibWeight;
        olderSiblingWeight += (counted ? 0 : sibWeight);
      })
    }
    return {
      generation: generationWeight,
      before: olderSiblingWeight,
      mine: myWeight
    }
  }

  //keep public
  getStartFractionOfRoot(root = this.getRoot(), label='DEFAULT') {
    return this.isRoot(root)
        ? 0
        : this.getStartFractionOfParent(root, label) * this.getParent().getFractionOfRoot(root, label) + this.getParent().getStartFractionOfRoot(root, label);
  }

  //keep public
  getStartFractionOfParent(root = this.getRoot(), label='DEFAULT') {
    if (this.isRoot(root)) {
      return 0;
    } else {
      let weightStatsOfParent = this.getWeightStatsOfParent(root, label);
      return weightStatsOfParent.before * 1.0 / weightStatsOfParent.generation;
    }
  }

  //keep public
  getFractionOfRoot(root = this.getRoot(), label='DEFAULT') {
    return this.getFractionOfParent(root, label) * (this.isRoot(root) ? 1 : this.getParent().getFractionOfRoot(root, label));
  }


  //keep public
  getFractionOfParent(root = this.getRoot(), label='DEFAULT') {
    if (this.isRoot(root)) {
      return 1;
    } else {
      return this.weight[label] * 1.0 / (this.getParent().weight[label] - this.getParent().getWeightOfSelf());
    }
  }

  //ascending
  getParent(root = this.getRoot()) {
    return this.isRoot(root) ? null : this.state.parent;
  }

  isRoot(root = this.getRoot()) {
    return this === root;
  }

  getRoot() {
    return this.state.parent === null ? this : this.state.parent.getRoot();
  }

  getRootDistance(root = this.getRoot()) {
    return this === root ? 0 : 1 + this.getParent().getRootDistance(root);
  }

  getAncestors(includeSelf = false) {
    if (this.isRoot()) {
      return includeSelf ? [this] : [];
    } else {
      let a = this.getParent().getAncestors(true);
      if (includeSelf) {
        a.unshift(this);
      }
      return a;
    }
  }

  getMrca(node) {
    if (node == null) {
      return this;
    } else {
      let mine = this.getAncestors(true).reverse();
      let theirs = node.getAncestors(true).reverse();
      let mrca = -1;
      //work from root to node;
      while (mine.length > mrca && theirs.length > mrca && mine[mrca+1] == theirs[mrca+1]){
        mrca ++;
      }
      return mrca >= 0 ? mine[mrca] : null;
    }
  }
}

class MkGraph {
  constructor(props = {}) {
    this.state = Object.assign({}, {
      nodes: props.nodes || {},
      edges: props.edges || {},
      attributes: props.attributes || {},
      filters: props.filters || []
    })
  }

  setFilters(filters) {
    this.state.filters = filters;
  }

  setAttribute(key, value){
    this.state.attributes[key] = value;
  }

  addNode(node) {
    this.state.nodes[node.getId()] = node;
  }

  addEdge(edge) {
    this.state.edge[edge.getId()] = edge;
  }

  getNodes() {
    return this.state.nodes;
  }

  getEdges() {
    return this.state.edges;
  }

  getNode(nodeId) {
    return this.state.nodes[nodeId];
  }

  getFilters() {
    return this.state.filters;
  }

  uniqueAttributeValues(attr, transform = val=>val.toLowerCase()) {
    return Object.values(this.getNodes()).map(node=>{
      let val = node.getAttribute(attr);
      return val ? transform(val) : val;
    }).filter((v, i, a) => a.indexOf(v) === i).sort();
  }
}

class MkTree extends MkGraph {
  constructor(props = {}) {
    super(props);
    this.state = Object.assign(this.state, {
      rootId: props.rootId || null
    });
  }

  getRoot() {
    let node;
    for (node in this.getNodes()) break;
    return this.getNode(node).getRoot();
  }
}

const MIN_RADIUS_CENTER_TEXT = 0;
const MIN_RADIUS_LABEL = 5;
const LINE_HEIGHT_FACTOR = 1.2; //line spacing
const LABEL_SIZE_FACTOR = 2;
const LABEL_SIZE_DEFAULT = 10;
const MIN_NODE_HEIGHT_FOR_LABEL = 8;
const SEARCH_RESULT_FILTER_NAME = 'Limit to Search Results';

class Stateful {
  constructor(props) {
    let hash = window.location.hash;
    if (props && hash && hash.length > 0) {
      Object.assign(props, this.getPropsFromParamString(hash.substr(1)))
    }
  }

  setState(newState) {
    let changed = [];
    for (let key in newState) {
      if (!(key in this.state)) {
        console.error('non-existant key', key, this.state, newState);
      } else if (! this.isEqual(this.state[key], newState[key])) {
        changed.push(key);
        this.state[key] = newState[key];
      }
    }
    if (changed.length > 0) {
      this.render(changed);
    }
  }

  render() {
    console.log('bare render of Stateful subclass')
  }

  //TODO change name to hashString
  updateQueryString() {
    let queryState=this.getQueryState();
    let queryString = Object.keys(queryState)
      .filter(key=>(queryState[key] != null && queryState[key].length != 0))
      .map(key=>(encodeURIComponent(key) + '=' + encodeURIComponent(queryState[key]))).join('&');
    window.location = '#' + queryString;
    debug('setState', this.constructor.name, queryString);
  }

  getPropsFromParamString(queryString) {
    return queryString.split('&') //split params
        .map(param=>param.split('=') // split key values
          .map(val=>decodeURIComponent(val))) //decode both key and value
        .reduce((acc, pair)=>Object.assign(acc, {[pair[0]] : pair[1]}), {}) //collect into an object
  }

  getQueryState() {
    return {}
  }

  //TODO move this to a utility object
  isEqual(a, b, checked = []) {
    if (checked.some(pair=>((pair[0] === a && pair[1] === b) || (pair[0] === b && pair[1] === a)))) {
      return true;
    } else {
      checked.push([a,b]);
    }
    if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
      if (Array.isArray(a)) {
        return Array.isArray(b) && a.length === b.length && a.every((d,i) => this.isEqual(d,b[i], checked));
      } else if (a.constructor.name === 'Object') {
        return a.constructor.name === b.constructor.name
            && Object.keys(a).every(key=>this.isEqual(a[key], b[key], checked))
      } else {
        // do not deep inspect objects if they are not plain objects. rely on a getId function
        return a.constructor.name === b.constructor.name
            && 'getId' in a && 'getId' in b
            && typeof a.getId === 'function' && typeof b.getId === 'function'
            && a.getId() === b.getId();
      }
    } else {
      return a === b;
    }
  }
}

class MkGraphLegend extends Stateful {
  constructor(props, parentElement = document.body) {
    super();

    this.state = {
      title: props.title,
      graphView: props.graphView,
      filters: props.filters || {},
      filtersHidden: props.filtersHidden || [],
      colors: props.colors || {},
      showColors: props.colors && Object.keys(props.colors).length > 0,
      multiSelect: 'multiSelect' in props ? props.multiSelect : true,
      or: 'or' in props ? props.or : true
    }

    this.state.selected = props.filtersOn
        ? props.filtersOn.split(',')
            .map(filterName=> filterName === this.getEmptyFilterName() ? '' : filterName)
            .filter(filterName=> Object.keys(this.state.filters).includes(filterName))
        : [];

    this.state.graphView.addFilterer(this);

    this.legend = d3.select(parentElement).append('div');
    if (this.state.filtersHidden.length < Object.keys(this.state.filters).length) {
      //there are non-hidden filters, so we want the padding;
      this.legend.attr('class', 'legend');
    }
    this.title = this.legend.append('div').attr('class', 'legend_title');

    this.height = this.height.bind(this);
    this.bgColor = this.bgColor.bind(this);
    this.textColor = this.textColor.bind(this);
    this.render = this.render.bind(this);
    this.toggleFilter = this.toggleFilter.bind(this);
    this.getSelectionFilters = this.getSelectionFilters.bind(this);
  }

  height() {
    return this.legend.node().getBoundingClientRect().height
  }
  bgColor(category) {
    if (category in this.state.colors) {
      let color = this.state.colors[category];
      return Array.isArray(color) ? color[0] : color;
    } else {
      return '#444';
    }
  }
  textColor(category) {
    if (category in this.state.colors) {
      let color = this.state.colors[category];
      return Array.isArray(color) ? color[1] : MkGraphView.contrastColor(color);
    } else {
      return '#EEE'
    }
  }
  render() {
    this.title.html(this.state.title);

    let d3entries = this.legend.selectAll("div.legend_entry")
      .data(Object.keys(this.state.filters).filter(f=>!this.state.filtersHidden.includes(f)));

    d3entries.exit().remove();

    let divs = d3entries.enter().append("div")
      .attr("class", 'legend_entry')
    .merge(d3entries)
      .style('color',            category=>this.state.selected.includes(category) ? this.textColor(category) : null)
      .style('background-color', category=>this.state.selected.includes(category) ? this.bgColor(category) : null);

    d3entries = divs.selectAll('span')
      .data((category) => {
        if (this.state.showColors) {
          return [[category, this.bgColor(category)], [category]]
        } else {
          return [[category]]
        }
      })
    d3entries
      .enter()
          .append('span')
      .merge(d3entries)
          .html(d => (d.length > 1 ? '&nbsp;' : (d[0].trim().length > 0 ? d[0] : '[empty]')))
          .style('background-color', d=>(d.length > 1) ? d[1] : null)
          .style('color', d=>(d.length === 1 && d[0].trim().length === 0 && !this.state.selected.includes(d[0])) ? '#999' : null)
          .on('click', d=>{
            d3.event.stopPropagation();
            this.toggleFilter(d[0])
          })
  }

  toggleFilter(filterName, shouldBeOn) {
    let selected = this.state.selected.filter(()=>true);
    let changed = false;
    if (selected.includes(filterName)) {//filter is currently on
      changed = !(shouldBeOn === true);
      selected = selected.filter(elt=>(elt !== filterName || shouldBeOn === true))
    } else { //filter is currently off
      if (shouldBeOn !== false) {
        changed = true;
        if (!this.state.multiSelect) {
          selected = [];
        }
        selected.push(filterName);
      }
    }
    if (changed) {
      this.setState({
        selected: selected
      });
      this.state.graphView.render(['filtersOn']);
    }
  }

  getSelectionFilters() {
    let filters = {}
    if (this.state.or && this.state.selected.length > 0) {
      let filterName = this.state.selected
        .map(s=>s.length > 0 ? s : this.getEmptyFilterName())
        .join(',');
      let filterList = this.state.selected.map(sel=>this.state.filters[sel]);
      filters[filterName] = (node) => filterList.some((filter) => filter(node));
    } else {
      this.state.selected.forEach(selected=>{
        let s = selected.length > 0 ? selected : ('!' + this.state.title);
        filters[s] = this.state.filters[selected];
      })
    }
    return filters;
  }

  getEmptyFilterName() {
    return ('!' + this.state.title); //TODO handle not title?
  }
}

class MkGraphInfo {
  constructor(props, graphView, parentElement) {
    this.graphView = graphView;
    this.container = parentElement.append('div');
    this.infoTable = this.container.append('table').attr('class', 'info_element');
    this.shouldHide = false;
    this.infoElement = false;
    this.closeButton = this.container.append('div')
      .attr('class', 'close_button')
      .html('&times;')
      .on('click', () => {
        this.shouldHide = true;
        this.render();
      });
  }

  render() {
    let view = this.graphView;
    if (this.infoElement !== view.state.infoBoxNodeId) {
      this.shouldHide = false;
    }
    if (this.infoElement !== view.state.infoBoxNodeId || this.shouldHide || !view.state.infoBoxNodeId) {
      this.infoElement = view.state.infoBoxNodeId;
      let info = new InfoBox();
      let shouldShowExit = false;
      if (this.infoElement && !this.shouldHide) {
        shouldShowExit = true;
        info = view.state.infoBox(view.getGraph().getNode(this.infoElement));
      } else {
        view.appendGraphData(info);
      }

      view.populateTable(this.infoTable, info);

      if (shouldShowExit) {
        this.closeButton.style('display', 'block');
      } else {
        this.closeButton.style('display', 'none');
      }
      debug('end infoBox');
    }
  }
}

class MkGraphSearch {
  constructor(props, graphView, parentElement = document.body) {
    this.graphView = graphView;
    this.parentElement = parentElement;

    this.state = {
      searchFields: props.searchFields || null,
      searchSort: props.searchSort || null,
    }

    if (props.search && props.search.trim().length > 0) {
      this.graphView.state.searchResultNodes = this.search(props.search);
    } else {
      this.graphView.state.search = null
    }

    this.render = this.render.bind(this);
    this.left = this.left.bind(this);
    this.open = this.open.bind(this);

    let d3parent = d3.select(this.parentElement);

    this.sideBar = d3parent.append("div").attr("id", 'info_box');

    this.titleBox = this.sideBar.append('header')
    this.titleHeader = this.titleBox.append('h2').attr('id', 'info_box_title');

    let filterContainer = this.titleBox.append('div');

    let filters = props.filters || {};
    filters[SEARCH_RESULT_FILTER_NAME] = (node) => {
      return graphView.state.searchResultNodes.includes(node);
    };
    this.filterList = new MkGraphLegend({
      filters: filters,
      filtersHidden: [SEARCH_RESULT_FILTER_NAME],
      or: false,
      graphView: this.graphView,
      filtersOn: props.filtersOn,
    }, filterContainer.node());

    if (props.attributeFilterSets) {

      Object.keys(props.attributeFilterSets).forEach(attr=>{
        let values = 'values' in props.attributeFilterSets[attr]
          ? props.attributeFilterSets[attr].values
          : this.graphView.getGraph().uniqueAttributeValues(attr)
        let sort = !('sort' in props.attributeFilterSets[attr]) || props.attributeFilterSets[attr].sort;
        let filters = 'filters' in props.attributeFilterSets[attr]
          ? props.attributeFilterSets[attr].filters
          : MkGraphView.filtersByAttributeValue(attr, values, sort)
        new MkGraphLegend({
          title: attr,
          filters: filters,
          graphView: this.graphView,
          filtersOn: props.filtersOn,
        }, filterContainer.node());
      })
    }

    this.search = this.search.bind(this);

    this.infoBoxBody = this.sideBar.append('div').attr('class', 'info_box_body');

    this.footer = this.sideBar.append('footer');

    this.isOpen = true;
    this.toggle = this.sideBar.append('div').attr('id', 'toggle_info_box').text('›').on('click', ()=>{this.open(!this.isOpen)});

    this.searchInput = this.infoBoxBody.append('input')
      .attr('placeholder', 'search graph');

    this.searchInput.on('keypress', (e) => {
      if (!e) e = window.event;
      var keyCode = e.keyCode || e.which;
      if (keyCode == '13'){
        let criteriaString = this.searchInput.property('value');
        let nodes;
        if (criteriaString.trim().length === 0) {
          criteriaString = null;
          nodes = [];
          this.filterList.toggleFilter(SEARCH_RESULT_FILTER_NAME, false)
        } else {
          nodes = this.search(criteriaString);
        }
        this.graphView.setState({
          searchResultNodes: nodes,
          search: criteriaString
        })
        return false;
      }
    })

    this.searchResultMessage = this.infoBoxBody.append('div').attr('class', 'search_message');
    this.searchOptions = this.infoBoxBody.append('div').attr('class', 'search_options');
    this.searchResults = this.infoBoxBody.append('div')
      .append('table')
      .attr('class', 'info_element')
      .style('display', 'none');

  }

  searchCriteria(criteriaString) {
    //TODO find quotes so that it's easy to search for first or last names. Also score search based on closeness
    //get separate terms in lowercase
    let criteria = criteriaString.toLowerCase().split(';');
    //trim criteria; filter empties
    criteria = criteria.map(t=>t.trim()).filter(t=>t !== '');
    //email special case TODO move this out into some settable search functions
    criteria = criteria.map(e=>(e.includes('<') ? e.split('<')[1].split('>')[0]: e))
    //split into bundled terms
    criteria = criteria.map(e=>e.split(/[\s]+/));
    return criteria;
  }

  search(criteriaString) {
    let view = this.graphView;
    let nodes = [];
    if (criteriaString.trim().length !== 0) {
      let criteria = this.searchCriteria(criteriaString)
      debug('search starting', criteria, criteria.filter(c=>c.length === 1).map(c=>c[0]));

      let searchFields = this.state.searchFields;
      Object.values(view.getGraph().getNodes()).forEach(function(node){
        // search
        if (criteria.filter(c=>c.length === 1).map(c=>c[0]).includes(node.getId().toLowerCase())) {
          nodes.push(node);
          return;
        }
        let attrs = node.getAttributes();
        for (let key in attrs) {
          if ((searchFields == null || searchFields.includes(key))
              && criteria.some(criterion=>criterion.every(term => attrs[key].toLowerCase().includes(term)))) {
            nodes.push(node);
            return;
          }
        }
      }, true);
      if (this.state.searchSort) {
        nodes.sort(this.state.searchSort);
      } else {
        nodes.sort();
      }
      debug('search found ' + nodes.length + ' nodes');
    }

    return nodes;
  }

  left(){
    return this.sideBar.node().getBoundingClientRect().left;
  }

  open(isOpen = null) {
    if (isOpen === null || this.isOpen == isOpen) {
      return this.isOpen;
    } else {
      if (isOpen) {
        this.isOpen = true;
      } else {
        this.isOpen = false;
      }
      d3.select(this.parentElement).classed('hidden_info_box', !this.isOpen)
      this.toggle.text(this.isOpen ? '›' : '‹')
      this.graphView.render();
    }
  }

  //called by graph.render
  render() {
    debug('start MkGraphSearch');
    let view = this.graphView;
    let resultNodes = view.state.searchResultNodes;

    this.titleHeader.text(view.state.title);

    //toggle focus as needed. this does not trigger a redraw
    //TODO, to improve performance, only visit nodes that are (a) currently classed focus or (b) in resultNodes or infoBoxNodeId
    view.container.selectAll(".node")
      .classed('focus', d=> view.nodeIsFocused(d.node))
      //.style('opacity', d => d.node.isIncludedSelf() ? 1 : 0.2); this invalidates text color contrast.
      //TODO decide what's more important: text color contrast or changing opacity to 0.2 for deselected nodes

    //begin search
    this.searchInput.property('value', view.state.search || '');
    let searchResultNodesVisible = [];
    let excludingFilters = {};
    resultNodes.forEach(node => {
      if (!node.isIncludedSelf()) {
        node.getExcludingFilters().forEach(filterName => {
          excludingFilters[filterName] = true;
        })
      } else if (view.isVisibleInGraphState(node)) {
        searchResultNodesVisible.push(node);
      } else {
        //node is off screen
      }
    });
    excludingFilters = Object.keys(excludingFilters);
    let searchResultNodesNotVisible = resultNodes.filter(node=>!searchResultNodesVisible.includes(node));

    let labelClass = 'label';
    let searchInfo;
    if (resultNodes.length > 0) {
      //search results
      labelClass = 'label_narrow';
      searchInfo = new InfoBox({
        title: "found " + resultNodes.length + ' result' + (resultNodes.length > 1 ? 's' : '')
          + (searchResultNodesNotVisible.length > 0 ? ' (showing ' + searchResultNodesVisible.length + ')':'')
      });
      let orderedNodes = searchResultNodesVisible.concat(searchResultNodesNotVisible); //
      orderedNodes.forEach((node, i) => {
        let ib = view.state.infoBox(node);
        let key = (i < searchResultNodesVisible.length) ? i+1 : ('x ' + (i - searchResultNodesVisible.length + 1));
        searchInfo.addEntry(key + ':', ib.state.title, node);
        searchInfo.addEntry(key + '.', Object.keys(ib.state.entries).filter(k=>(ib.state.limitedKeys === null || ib.state.limitedKeys.includes(k))).map(k=>ib.state.entries[k]).join('; '));
      });
    } else if (view.state.search !== null) {
      searchInfo = new InfoBox({
        title: 'found no results',
      });
    }

    if (searchInfo) {
      this.searchResultMessage.text(searchInfo.state.title);

      //Set filters
      let options = [];
      options.push(['clear', () => {
        view.setState({
          search: null,
          searchResultNodes: []
        });
        this.filterList.toggleFilter(SEARCH_RESULT_FILTER_NAME, false);
      }]);
      let isFiltered = (SEARCH_RESULT_FILTER_NAME in this.filterList.getSelectionFilters());
      if (resultNodes.length >= 1 || isFiltered) {
        options.push(['show ' + (isFiltered ? 'all nodes' : 'only results'), () => {
          this.filterList.toggleFilter(SEARCH_RESULT_FILTER_NAME);
        }]);
      }
      if (searchResultNodesNotVisible.length > 0) {
        //TODO get this working again
        //options.push([(resultNodes.length > 1) ? 'expand graph to all search results' : 'move to search result', function(){
        //  let newState = view.getStateToUnhideNodes(resultNodes)
        //  view.setState(newState);
        //}]);
      }

      //insert divider between options for readability
      options = options.reduce((opts, v, i)=>opts.concat([v], i < options.length - 1 ? null : []), []);
      var link = this.searchOptions.selectAll("a.info_box_filter").data(options,d=>(d === null ? d : d[0]));
      link.exit().remove();
      link.enter().append('a')
        .attr('class', 'info_box_filter')
        .attr('href', (d)=>(d==null ? null : '#'))
      .merge(link)
        .text(d=>(d==null ? '|' : d[0]))
        .on('click', d=>{
          d3.event.preventDefault();
          if (d !== null) {
            d[1]();
          }
        });

      if (Object.keys(searchInfo.getEntries()).length > 0) {
        this.graphView.populateTable(this.searchResults, searchInfo, labelClass);
        this.searchResults.style('display', 'block');
      } else {
        this.searchResults.style('display', 'none');
      }
    } else {
      this.searchResultMessage.html('');
      this.searchOptions.html('');
      this.searchResults.style('display', 'none');
    }
  }
}

class MkGraphView extends Stateful {
  constructor(props, parentElement = document.body) {
    super(props);
    this.state = {
      graph: props.graph,
      title: props.title || 'Graph',
      colorFunction: props.colorFunction,
      label: props.label || function(d) {
        return d.getId();
      },
      tooltip: props.tooltip || function(node) {
        return node.getId();
      },
      infoBox: props.infoBox || function(node) {
        return InfoBox.of(node);
      },
      search: props.search || null,
      searchResultNodes: props.searchResultNodes || [],
      infoBoxNodeId: props.infoBoxNodeId || null,
      elementViews: props.elementViews || {nodeViews: [], edgeViews: []}
    }

    this.parentElement = parentElement;
    let d3parent = d3.select(parentElement);
    this.parentElement.innerHTML = '';

    this.filterers = [];

    let view = this;
    this.svg = d3parent.append("svg")
      .attr("id", 'graph_svg')
      .attr("tabindex", 1)
      .on('click', function(){
        view.setState({
          infoBoxNodeId: null
        })
      })
    d3parent
      .on('mouseover', d=>view.hover())
      .on('mouseout', d=>view.hover());
    this.container = this.svg.append('g');

    this.graphSearchView = new MkGraphSearch(props, this, this.parentElement);
    this.graphInfoView = new MkGraphInfo(props, this, this.graphSearchView.footer);

    //legend
    if (!this.state.colorFunction) {
      if (props.colorAttributeKey) {
        let colors = props.colorByAttributeValue
          ? props.colorByAttributeValue
          : MkGraphView.colorsByAttributeValue(
              this.state.graph.uniqueAttributeValues(props.colorAttributeKey),
              props.colorOverrides || {}
            );

        this.state.colorFunction = MkGraphView.colorNodeByAttribute(props.colorAttributeKey, colors);

        let legendContainer = d3parent.append("div").attr("id", 'legend_container')
        this.legend = new MkGraphLegend({
          title: props.colorAttributeKey,
          colors: colors,
          filters: MkGraphView.filtersByAttributeValue(props.colorAttributeKey, Object.keys(colors)),
          filtersOn: props.filtersOn,
          graphView: this
        }, legendContainer.node());
        //TODO handle legend for arbitrary color function
      } else {
        this.state.colorFunction = (d) => '#ccc'
      }
    }

    //tooltip
    let tooltip = d3parent.append("span")
      .attr("id", 'tooltip');
    this.tooltip = tooltip;
    d3parent.on('mousemove', function(){
      tooltip
        .style("left", (d3.event.pageX + 28) + "px")
        .style("top", (d3.event.pageY + 28) + "px");
    })

    this.loader = d3parent.append("div")
      .attr("class", 'loading_small')
    this.loader.append('div').attr('class', 'loading_spinner');
    this.loader.append('span').text('loading...');

    window.addEventListener("resize", e=>(view.render()));

    this.isVisibleInGraphState = this.isVisibleInGraphState.bind(this);
    this.render = this.render.bind(this);
    this.isEqual = this.isEqual.bind(this);
    this.hover = this.hover.bind(this);
    this.hoverDelegate = this.hoverDelegate.bind(this);
    this.click = this.click.bind(this);
    this.dblclick = this.dblclick.bind(this);
  }

  populateTable(table, info, labelClass = 'label') {
    let d3entries = table.selectAll("tr").data(Object.keys(info.getEntries()));

    d3entries.exit().remove();

    let rows = d3entries.enter().append("tr")
      .attr("class", 'datum')
    .merge(d3entries)

    d3entries = rows.selectAll('td')
      .data((row) => {
        let link = info.state.links[row];
        if (link) {
          return [[row, labelClass], [info.getEntries()[row], 'link', link]]
        } else {
          return [[row, labelClass], [info.getEntries()[row]]]
        }
      })
    d3entries
      .enter()
          .append('td')
      .merge(d3entries)
          .html(d => d[0])
          .attr('class', d=>(d.length > 1 ? d[1] : null))
          .on('click', d=>{
            d3.event.stopPropagation();
            if (d.length > 2) {
              let link = d[2];
              if (Array.isArray(link)) {
                let searchQuery = link.map(node=>node.getId()).join('; ')
                this.setState({
                  searchResultNodes: link,
                  search: searchQuery
                });
              } else if (typeof link == 'function') {
                link.call(this);
              } else {
                //link is a node
                this.click(link);
              }
            }
          })
          .on('dblclick', d=>{
            d3.event.stopPropagation();
            if (d.length > 2) {
              let link = d[2];
              if (Array.isArray(link)) {
                //do nothing
              } else if (typeof link == 'function') {
                //do nothing
              } else {
                //TODO add an icon for zooming to node
                //link is a node
                this.dblclick(link);
              }
            }
          })
  }

  getDimensions() {
    let height = window.innerHeight - this.svg.node().getBoundingClientRect().top
    return {
      width: window.innerWidth,
      height: height,
      graphWidth: this.graphSearchView.left(),
      graphHeight: height - (this.legend ? this.legend.height() : 0)
    }
  }

  getGraph() {
    return this.state.graph;
  }

  shouldRedraw(stateChanged) {
    const GRAPH_AFFECTING_STATE = ["colorFunction", "label", "filters", "filtersOn", "search"];
    return !stateChanged || stateChanged.some(key=>GRAPH_AFFECTING_STATE.includes(key));
  }

  isVisibleInGraphState(node) {
    return this.state.elementViews.nodeViews.filter(d=>{
      return (d.node === node)//TODO make this more efficient by checking all nodes with one nodeView iteration
    }).length > 0; //TODO
  }

  appendGraphData(info) {
    let nodes = Object.values(this.state.graph.getNodes())
    let nodesVisible = nodes.filter(node=>node.isIncludedSelf());
    info.addEntry('nodes total', nodes.length, nodes);
    if (nodes.length !== nodesVisible.length) {
      info.addEntry('nodes included', nodesVisible.length, nodesVisible);
    }
  }

  addFilterer(filterer) {
    this.filterers.push(filterer);
  }

  getStateToUnhideNodes(nodesToUnhide) {
    return {};//TODO
  }

  //TODO clean this up -- obviously just a test
  getElementViews() {
    let edgeViews = [];
    let nodeViews = [];
    let dimensions = this.getDimensions();

    let margins = {
      l: 14,
      r: 14,
      t: 14,
      b: 14
    };

    let width = 36;
    let height = 12;
    let graphWidth = dimensions.graphWidth - margins.l - margins.r;
    let x = margins.l + width/2;
    let y = margins.t + height/2;
    let last = null;

    let nodes = Object.values(this.getGraph().getNodes()).filter(node=>node.isIncludedSelf());
    nodes.sort((a,b)=>(this.state.colorFunction({node: a}).toString().localeCompare(this.state.colorFunction({node: b}).toString())));
    nodes.forEach((node, i) => {
      if (y < dimensions.graphHeight - margins.t) {
        let n = new NodeView({
          node: node,
          label: true,
          labelSize: 10,
          height: height,
          width: width,
          x: x,
          y: y // use bottom margin, since these are the nodes along the top
        }, this)
        nodeViews.push(n)
        if (last !== null) {
          //edgeViews.push([last, n])
        }
        last = n;
        if (x > graphWidth - width * 1.25) {
          x = margins.l + width/2;
          y += height * 1.5;
        } else {
          x += width * 1.2;
        }
      }
    })
    debug('end compute graph');
    return {
      nodeViews: nodeViews,
      edgeViews: edgeViews
    }
  }

  nodeIsFocused(node) {
    return (this.state.searchResultNodes.includes(node) || this.state.infoBoxNodeId === node.getId())
  }

  hover(node, prefix = null, suffix = null) {
    d3.event.stopPropagation();
    if (node) {
      let string = node instanceof MkNode ? this.state.tooltip(node) : node;
      this.tooltip
        .style('display', 'inline-block')
        .html((prefix ? prefix : '') +
            string +
            (suffix ? suffix : ''));
    } else {
      this.tooltip
        .style('display', 'none')
        .html('');
    }
  }

  hoverDelegate(cluster, delegate) {
    //TODO consider what clustered nodes mean in a non-tree graph
    this.hover(delegate, 'cluster of size ' + cluster.length + ' containing ');
  }

  click(node, prefix = null, suffix = null) {
    d3.event.stopPropagation();
    this.setState({
      infoBoxNodeId: node.getId()
    })
  }

  dblclick(node, prefix = null, suffix = null) {
    d3.event.stopPropagation();
    //todo what should happen on dblclick in a graph?
  }

  getQueryState() {
    return Object.assign(super.getQueryState(), {
      filtersOn: Object.keys(this.updateFilterers()).join(','),
      search: this.state.search, //TODO get this from search box
      infoBoxNodeId: this.state.infoBoxNodeId ? this.state.infoBoxNodeId : null
    })
  }

  updateFilterers() {
    let activeFilters = {}

    this.filterers.forEach(filterer=>{
      filterer.render();
      let sf = filterer.getSelectionFilters();
      //TODO check for name collisions
      activeFilters = Object.assign(sf, activeFilters)
    })

    return activeFilters;
  }

  //called by setState. also should be called when setState is not called but graph should be rerendered.
  render(changed) {
    this.updateQueryString();
    debug('render', changed);
    this.loader.style('display', 'inline-block');
    if (!changed || (changed && changed.includes('dimensions'))) {
      this.resizeGraph(this.getDimensions());
    }

    let activeFilters = this.updateFilterers();

    this.getGraph().setFilters(activeFilters);
    this.graphInfoView.render();
    setTimeout(()=>{
      if (this.shouldRedraw(changed)) {
        //update elementViews in state
        this.state.elementViews = this.getElementViews();
        let newDimensions = this.drawGraphElements();
        if (newDimensions) {
          //TODO update state to reflect that the graph overflows
          this.resizeGraph(newDimensions);
        }
      }
      this.graphSearchView.render(); //needs to be done after because it relies on element view update
      this.loader.style('display', 'none');
    }, 10);
  }

  resizeGraph(dimensions) {
    this.svg
      .attr("width", dimensions.width)
      .attr("height", dimensions.height);
    debug('resize done');
  }

  drawGraphElements() {
    debug('start drawGraphElements');
    let nodes = this.state.elementViews.nodeViews;
    let edges = this.state.elementViews.edgeViews;

    const CLASSES = {
        line: 'edge'
      };
    var line = d3.line()
      .x((d,index)=>{
        return d.x + (index == 0 ? 1 : -1) * d.edgeOffsetX;
      })
      .y((d, index)=>(d.y + (index == 0 ? 1 : -1) * d.edgeOffsetY));

    let t = this.svg.transition().duration(750);

    //EDGES
    var d3edges = this.container.selectAll("path." + CLASSES.line)
      .data(edges.filter(edge => {
        return !(edge[1].isHidden) && !('span' in edge[1]);
      }), d => {
        return `${d[0].node.getId()},${d[1].node.getId()}`;
      });

    d3edges.exit().remove();

    d3edges.enter().append("path")
      .attr("class", CLASSES.line)
      .style('stroke', d=>{
        return this.state.colorFunction(d[1]);
      })
      .style('stroke-width','1.5px')
      .style('opacity',0)
      .transition(t)
          .delay(500)
        .style('opacity', d => (d[0].node.isIncludedSelf() && d[1].node.isIncludedSelf()) ? 0.5 : 0.1)
          .selection()
    .merge(d3edges)
      .transition(t)
        .style('opacity', d => (d[0].node.isIncludedSelf() && d[1].node.isIncludedSelf()) ? 0.5 : 0.1)
        .attr("d", function(a) {
          return line(a);
        });

    /*GROUP EDGES*/
    var d3groupEdges = this.container.selectAll("polygon.group_edge")
      .data(edges.filter(d => {
        return 'span' in d[1];
      }), d => {
        return `${d[0].node.getId()},${d[1].node.getId()}`;
      });

    d3groupEdges.exit().remove();

    d3groupEdges.enter().append("polygon")
      .attr("class", 'group_edge')
      .classed('clickable', true)
      .style('fill', d=>{
        return this.state.colorFunction(d[1]);
      })
      .style('opacity',0)
      .on('mouseover', d=> this.hoverDelegate(d[1].spanNodes, d[0].node))
      .on('click', d => this.click(d[0].node))
      .on('dblclick', d => this.dblclick(d[0].node))
      .transition(t)
          .delay(500)
        .style('opacity', d => d[0].node.isIncludedSelf() ? 0.5 : 0.1)
          .selection()
    .merge(d3groupEdges)
      .transition(t)
        .attr("points", function(d) {
          let node;
          //TODO allow spans from source nodes as well.
          node = d[0];      let a = [node.x + node.edgeOffsetX, node.y + node.edgeOffsetY];
          node = d[1];      let b = [node.x - node.edgeOffsetX, node.y - node.edgeOffsetY];
          node = d[1].span; let c = [node.x - node.edgeOffsetX, node.y - node.edgeOffsetY];
          return [a, b, c].map(coord => coord.join(',')).join(' ')
        })
        .style('opacity', d => d[1].spanNodes.some(e=>e.node.isIncludedSelf()) ? 0.5 : 0.1);

    //TODO don't remove till after transition?

    //GROUP NODES
    var d3groupNodes = this.container.selectAll("polygon.group_node")
      .data(nodes.filter(d => {
        return 'span' in d;
      }), d => d.node.getId());

    d3groupNodes.exit().remove();

    d3groupNodes.enter().append("polygon")
      .attr("class", 'group_node')
      .classed('clickable', true)
      .style('fill', this.state.colorFunction)
      .style('opacity',0)
      .on('mouseover', d=>this.hoverDelegate(d.spanNodes, d.delegate))
      .on('click', d => this.click(d.delegate))
      .on('dblclick', d => this.dblclick(d.delegate))
      .transition(t)
          .delay(500)
        .style('opacity', d => d.spanNodes.some(e=>e.node.isIncludedSelf()) ? 1 : 0.2)
          .selection()
    .merge(d3groupNodes)
      .transition(t)
        .attr("points", function(n) {
          let spanx = (n.span.x == n.x)
            ? n.x
            : (n.span.x > n.x
                ? Math.max(n.span.x,  n.x+1)
                : Math.min(n.span.x,  n.x-1));
          let spany = (n.span.y == n.y)
            ? n.y
            : (n.span.y > n.y
                ? Math.max(n.span.y,  n.y+1)
                : Math.min(n.span.y,  n.y-1))
          let a = {x: n.x   - n.edgeOffsetX, y: n.y   - n.edgeOffsetY};
          let b = {x: n.x   + n.edgeOffsetX, y: n.y   + n.edgeOffsetY};
          let c = {x: spanx + n.edgeOffsetX, y: spany + n.span.edgeOffsetY};
          let d = {x: spanx - n.edgeOffsetX, y: spany - n.span.edgeOffsetY};
          return [a, b, c, d].map(point => [point.x, point.y].join(',')).join(' ')
        })
        .selection().raise();
    //*/
    //NODES
    //https://threejs.org/examples/#webgl_materials_texture_rotation for color cube
    //TODO make this a group with the rect and text https://stackoverflow.com/questions/9206732/how-to-add-compound-node-in-a-d3-force-layout
    //g should be centered on d.x,d.y using transform rect and text should be centered on 0
    //click, dblclick, hover, etc events should all happen on group
    //enter shouldn't happen until after move because it can be very slow. can enter happen in callback?
    // start implementing https://www.opm.gov/policy-data-oversight/data-analysis-documentation/federal-employment-reports/reports-publications/sizing-up-the-executive-branch-2015.pdf
    //https://en.wikipedia.org/wiki/Organizational_structure_of_the_United_States_Department_of_Defense
    var d3nodes = this.container.selectAll(".node")
      .data(nodes.filter(node => {
        return (!node.isHidden && !('span' in node)) || node.hasFocus();
      }), d => d.node.getId());

    d3nodes.exit().remove();
    d3nodes
      .classed('focus', d=>d.hasFocus())
      .transition(t)
          .attr("x", function(d) {
            return d.x - d.width/2 - (d.hasFocus() ? 1 : 0);
          })
          .attr("y", function(d) {
            return d.y - d.height/2 - (d.hasFocus() ? 1 : 0);
          })
          .attr("width", function(d){
            return d.width + (d.hasFocus() ? 2 : 0);
          })
          .attr("height", function(d){
            return d.height + (d.hasFocus() ? 2 : 0);
          })
          .style('opacity', d => d.node.isIncludedSelf() || d.hasFocus() ? 1 : 0.2)
          .style('fill', this.state.colorFunction)
      .selection().raise();

    d3nodes.enter().append("rect")
      .classed('node', true)
      .classed('clickable', true)
      .classed('focus', d=>d.hasFocus())
      .on('mouseover', d=> this.hover(d.node))
      .on('click', d => this.click(d.node))
      .on('dblclick', d => this.dblclick(d.node))
      .attr('id', d => d.node.getId())
      .attr("x", function(d) {
        return d.x - d.width/2 - (d.hasFocus() ? 1 : 0);
      })
      .attr("y", function(d) {
        return d.y - d.height/2 - (d.hasFocus() ? 1 : 0);
      })
      .attr("width", function(d){
        return d.width + (d.hasFocus() ? 2 : 0);
      })
      .attr("height", function(d){
        return d.height + (d.hasFocus() ? 2 : 0);
      })
      .style('fill', this.state.colorFunction)
      .style('opacity',0)
      .transition(t)
          .delay(500)
        .style('opacity', d => d.node.isIncludedSelf() ? 1 : 0.2)
      .selection().raise();

    //LABELS
    var d3nodelabels = this.container.selectAll("text")
      .data(nodes.filter(d => {
        return (d.isHidden !== false) && !('span' in d) && d.label;
      }), d => d.node.getId());

    d3nodelabels.exit().remove();

    let labelFunc = this.state.label;
    d3nodelabels.enter().append("text")
      .attr("class", 'nodelabel')
      .classed('clickable', true)
      .on('mouseover', d => this.hover(d.node))
      .on('click', d => this.click(d.node))
      .on('dblclick', d => this.dblclick(d.node))
      .attr("x", function(d){
        if (d.width > MIN_RADIUS_CENTER_TEXT) {
          return d.x;
        }
        return d.x + d.width;
      })
      .attr("y", function(d){
        if (d.width > MIN_RADIUS_CENTER_TEXT) {
          return d.y;
        }
        return d.y - d.height;
      })
      .style('opacity',0)
      .transition(t)
          .delay(500)
        .style('opacity', d => d.node.isIncludedSelf() ? 1 : 0.8)
          .selection()
    .merge(d3nodelabels)
      .each(function(d, i){
        let textNode = d3.select(this);
        let lineHeight = d.labelSize * LINE_HEIGHT_FACTOR;
        let labelLength = Math.max(Math.floor(d.height / lineHeight), 1);
        let labelWidth = d.width / d.labelSize;
        let label = labelFunc(d.node, labelLength, labelWidth);
        label = Array.isArray(label) ? label : [label, ''];
        var tspans = textNode.selectAll("tspan")
            .data(label);
        const LABEL_TEXT_WIDTH_FACTOR = 1.9;
        let trunc = (s, width) => (width === null || !s ? s : (s.length <= width * LABEL_TEXT_WIDTH_FACTOR ? s : s.substr(0, width * LABEL_TEXT_WIDTH_FACTOR - 2) + '...'));
        tspans.exit().remove();
        tspans.enter().append('tspan')
          //.attr('dx', 0)
          //.attr('x', d.x)
        .merge(tspans)
          .text(line=>trunc(line, labelWidth))
          .attr('dy', (line,i)=>{
            return i == 0 ? (1 - label.filter(l=>l && l.length > 0).length) * 0.5 * lineHeight : lineHeight;
          })
          .attr("text-anchor", d.width > MIN_RADIUS_CENTER_TEXT ? "middle" : "start")
          .attr("alignment-baseline", "middle")
          .transition(t)
            .attr('x', d.x);
      })
      .style('font-size', d => d.labelSize)
      .style('fill', d=> {
        if (d.width >= MIN_RADIUS_CENTER_TEXT && (d.node.isIncludedSelf() || d.hasFocus())) {
          if (typeof this.state.colorFunction.textColor === 'function') {
            return this.state.colorFunction.textColor(d);
          } else {
            return MkTreeView.contrastColor(this.state.colorFunction(d));
          }
        } else {
          return "#000";
        }
      })
      .transition(t)
        .style('opacity', d => d.node.isIncludedSelf() ? 1 : 0.8)
        .attr("x", function(d){
          if (d.width > MIN_RADIUS_CENTER_TEXT) {
            return d.x;
          }
          return d.x + d.width/2;
        })
        .attr("y", function(d){
          if (d.width > MIN_RADIUS_CENTER_TEXT) {
            return d.y;
          }
          return d.y - d.height/2;
        })
      .selection().raise();

    // sort overlapping focus nodes so that label is with rect
    this.container.selectAll('text,.node')
      .filter(d=> this.nodeIsFocused(d.node))
      .raise()
      .sort((a,b)=>{
        return (a.x+a.y)-(b.x+b.y);
      });

    debug('end draw graph; dom length=', document.body.getElementsByTagName("*").length);

  }

}

//static function providing color
MkGraphView.contrastColor = function(color) {
  let c = d3.color(color);
  return (c.opacity * (c.r + c.g + c.b)/3 > 128) ? '#000' : '#EEE';
}
MkGraphView.colorNodeByAttribute = function(colorAttribute, colorByAttributeValue, defaultColor = '#000') {
  let cf = function(d) {
    let attributes = d.node.getAttributes();
    if (colorAttribute in attributes && attributes[colorAttribute].toLowerCase() in colorByAttributeValue) {
      return colorByAttributeValue[attributes[colorAttribute].toLowerCase()];
    } else {
      return defaultColor;
    }
  }
  let fun = function(d) {
    let colorResult = cf(d);
    return Array.isArray(colorResult) ? colorResult[0] : colorResult;
  }
  fun.textColor = function(d) {
    let colorResult = cf(d);
    return Array.isArray(colorResult) && colorResult.length >= 2 ? colorResult[1] : MkGraphView.contrastColor(colorResult);
  }
  return fun;
}

MkGraphView.colorsByAttributeValue = function(vals, colorOverrides = {}) {
  let colors = Object.assign(colorOverrides, {});
  vals.forEach((attrValue, i)=>{
    let color = d3.color(d3.interpolateSinebow(i/vals.length));
    color = (i % 2 === 0) ? color : color.darker();
    if (!(attrValue in colors) || colors[attrValue] == null) {
      colors[attrValue] = color;
    } else if (Array.isArray(colors[attrValue])) {
      colors[attrValue] = colors[attrValue];
    } else {
      colors[attrValue] = [color, colors[attrValue]];
    }
  })
  return colors;
}

MkGraphView.filtersByAttributeValue = function(attr, vals, sort = true, transform = val=>val.toLowerCase()) {
  let filters = {}
  vals = sort ? vals.sort() : vals;
  vals.forEach(attrValue=> {
    filters[attrValue] = (node => attr in node.getAttributes() ? attrValue === transform(node.getAttribute(attr)) : attrValue === node.getAttribute(attr));
  });
  return filters;
}

class MkTreeView extends MkGraphView {

  constructor(props, parentElement = document.body) {
    super(props, parentElement);
    this.state = Object.assign(this.state, {
      childString: props.childString || 'children',
      rootId: props.rootId || this.state.graph.getRoot().getId()
    });

    this.render = this.render.bind(this);
  }

  getQueryState() {
    return Object.assign(super.getQueryState(), {
        rootId: this.state.rootId,
    })
  }

  getStateToUnhideNodes(nodesToUnhide) {
    return {
      rootId: nodesToUnhide.reduce((acc, node)=>node.getMrca(acc), null).getId()
    }
  }

  appendGraphData(info) {
    super.appendGraphData(info);
    let root = this.getViewRoot();
    let descendents = root.getDescendents();
    descendents.unshift(root);
    info.addEntry('nodes visible in tree', descendents.length, descendents);
    let ancestors = root.getAncestors();
    if (ancestors.length > 0) {
      info.addEntry('ancestors', ancestors.length, ancestors);
    }
    let levelCount = root.getMaxDepth() + 1;
    info.addEntry('levels visible', levelCount)
  }

  shouldRedraw(stateChanged) {
    const GRAPH_AFFECTING_STATE = ["rootId", "childString"];
    return super.shouldRedraw(stateChanged) || stateChanged.some(key=>GRAPH_AFFECTING_STATE.includes(key));
  }

  levelPath(ch, dimensions, margins, levelNodes, nodes, rootPosition) {
    //setup
    let w = dimensions.graphWidth - margins.l - margins.r;
    let h = dimensions.graphHeight - margins.t - margins.b;

    //linear

    let xLineStart, xLineChange, yLineStart, yLineChange;

    if (rootPosition === 'corner') {
      //TODO
    } else if (rootPosition === 'left') {
      xLineStart = ch.offset;
      xLineChange = 0;
      yLineStart = h;
      yLineChange = -1 * h;
    } else {
    }

    let nodeWidth = ch.width;
    let nodeHeight = ch.height;

    let root = this.getViewRoot();

    let f;
    if (true) { //linear
      let method = (ch.extraSpace >= 0)
          ? 'betterfill' // fill the row as evenly as possible
          : 'weight'; // position in row based on weight

      if (method === 'fill') {
        let extraOffsetByNode = {};
        let offset = 0;
        levelNodes.forEach((node, index)=>{
          //TODO correct based on tree weight (grant more padding in proportion to the node's subtree weight)
          //this process corrects based on parent position if there's extra room in the line (levelLength > levelNodes.length)
          let parent = node.getParent(root) != null ? nodes[node.getParent(root).getId()] : null;
          if (parent != null) {
            let siblings = parent.node.getChildren();
            let childIndex = siblings.indexOf(node);
            let maxOffset = (ch.levelLength - levelNodes.length) / ch.levelLength;
            let bestOffset = parent.pathFrac - (index + siblings.length * 0.5 - childIndex) / ch.levelLength;
            if (bestOffset > offset) {
              if (maxOffset >= bestOffset) {
                offset = bestOffset;
              } else {
                offset = maxOffset;
              }
            }
          }
          extraOffsetByNode[index] = offset;
        })
        f = (node) => {
          let index = levelNodes.indexOf(node);
          return ((index + 0.5) / ch.levelLength) + (index in extraOffsetByNode ? extraOffsetByNode[index] : 0);
        }
      } else if (method === 'betterfill') {
        if (ch.levelLength !== levelNodes.length) {
          //previous level has more nodes, so position based on parent
          let extraOffsetByNode = {};
          let offset = 0;
          levelNodes.forEach((node, index)=>{
            let parent = node.getParent(root) != null ? nodes[node.getParent(root).getId()] : null;
            if (parent != null) {
              let maxOffset = (ch.levelLength - levelNodes.length) / ch.levelLength;
              let siblings = parent.node.getChildren();
              let childIndex = siblings.indexOf(node);
              let bestOffset = parent.pathFrac - (index + siblings.length * 0.5 - childIndex) / ch.levelLength;
              if (bestOffset > offset) {
                if (maxOffset >= bestOffset) {
                  offset = bestOffset;
                } else {
                  offset = maxOffset;
                }
              }
            }
            extraOffsetByNode[index] = offset;
          })
          f = (node) => {
            let index = levelNodes.indexOf(node);
            return ((index + 0.5) / ch.levelLength) + (index in extraOffsetByNode ? extraOffsetByNode[index] : 0);
          }
        } else {
          //level has more nodes than previous, so position based on children
          let extraSpaceFrac = ch.extraSpace/ch.lineLength;
          f = (node) => {
            let index = levelNodes.indexOf(node);
            let startFrac = node.getStartFractionOfRoot(root);
            let halfFrac = 0.5 * node.getFractionOfRoot(root);
            return (index + 0.5) * ch.nodeDeltaFrac + (startFrac + halfFrac) * extraSpaceFrac;
          }
        }
      } else {
        //method = weight
        f = (node) => {
          let startFrac = node.getStartFractionOfRoot(root);
          let halfFrac = 0.5 * node.getFractionOfRoot(root);
          return startFrac + halfFrac;
        }
      }
    }


    let shouldLabel = nodeHeight >= MIN_NODE_HEIGHT_FOR_LABEL;

    //TODO optimize view for sparce view: height based on density;
    //filter to: treasury
    //filter to: enterprise services
    //search: guru
    //TODO make this return type a LevelView class, and make a NodeView class;
    return {
      position: (node) => {
        let pathFrac = f(node);

        return new NodeView({
          node: node,
          label: shouldLabel,
          labelSize: LABEL_SIZE_DEFAULT,

          pathFrac: pathFrac,//used for anchoring child node

          width: nodeWidth,
          height: nodeHeight,
          edgeOffsetX: (rootPosition === 'corner' || rootPosition === 'left') ? nodeWidth/2 : 0,
          edgeOffsetY: (rootPosition === 'corner' || rootPosition !== 'left') ? nodeHeight/2 : 0,
          x: margins.l + nodeWidth/2 + xLineStart + xLineChange * pathFrac,
          y: margins.t + nodeHeight/2 + yLineStart + yLineChange * pathFrac
        }, this);
      }
    }
  }

  hoverDelegate(cluster, delegate) {
    this.hover(delegate, cluster.length + ' ' + this.state.childString + ' of ');
    //[0].node, , ' (' + d[0].node.getChildren(true).length + ')';
  }

  dblclick(node, prefix = null, suffix = null) {
    d3.event.stopPropagation();
    this.setState({
      rootId: node.getId()
    })
  }

  getViewRoot() {
    return this.getGraph().getNode(this.state.rootId);
  }

  getElementViews() {
    let view = this;
    let edges = [];
    let nodes = {};

    //TODO move here if mounted left, go up
    let rootPosition = 'left';

    let dimensions = this.getDimensions();
    let root = this.getViewRoot();
    let ancestors = root.getAncestors();

    let maxLabelTextLines = 4; //TODO get this from view state
    let ancestorRadius = 24;//TODO get this based on maxLabelTextLines
    let margin = ancestorRadius;
    let margins = {
      l: margin,
      r: margin,
      t: margin + ((rootPosition === 'left' || ancestors.length == 0) ? 0 : ancestorRadius * 2.5),
      b: margin
    };

    let child = root;
    root.weigh();
    let levelArray = []
    while (child) {
      //unfilter at root level
      let levelNodes = child.getLevelNodes(root, child === root);
      levelArray.push(levelNodes);
      let parent = levelNodes.find(node=>node.getChildren().length > 0);
      child = parent ? parent.getChildren()[0] : null;
    }

    let ch = this.getCharacteristic(levelArray, maxLabelTextLines, dimensions, margins, rootPosition);
    for (let level = 0; level < levelArray.length; level++) {
      let levelNodes = levelArray[level];
      let levelPath = this.levelPath(ch[level], dimensions, margins, levelNodes, nodes, rootPosition);

      let lastParent;
      let lastColor;
      let lastNonHidden;
      let lastNodeView;
      levelNodes.forEach(function(node){
        let nodeView = levelPath.position(node);
        let prevNodeView = lastNodeView;
        lastNodeView = nodeView;
        nodes[node.getId()] = nodeView;
        if (!node.isRoot(root) && node.getParent(root).getId() in nodes) {
          //node has parent
          edges.push([nodes[node.getParent(root).getId()], nodeView]);
          if (prevNodeView && view.overlaps(prevNodeView, nodeView) && !prevNodeView.hasFocus()) {
            //node is too close to previous.
            prevNodeView.label = false;
            if (!nodeView.hasFocus() && lastParent && lastColor && lastParent == node.getParent() && lastColor == view.state.colorFunction({node: node})) {
              //node should be spanned by previous node
              nodeView['isHidden'] = true;
              lastNonHidden.span = nodeView;
              if (!lastNonHidden.spanNodes) lastNonHidden.spanNodes = [lastNonHidden];
              lastNonHidden.spanNodes.push(nodeView)
              nodeView.label = false;
              return;
            }
          }
        }
        lastParent = node.getParent();
        lastColor = view.state.colorFunction({node: node});
        lastNonHidden = nodeView;
        lastNonHidden.delegate = lastParent;
      });
    }

    let last = nodes[root.getId()];

    nodes = Object.values(nodes);
    let nodeHeight = ancestorRadius * 2;
    let nodeWidth = ancestorRadius * 4;
    ancestors.forEach((node, i) => {
      let n = new NodeView({
        node: node,
        label: true,
        labelSize: 10,
        width: nodeWidth,
        height: nodeHeight,
        edgeOffsetX: (rootPosition !== 'left') ? nodeWidth/2 : 0,
        edgeOffsetY: (rootPosition === 'left') ? nodeHeight/2 : 0,
        x: last.x + (rootPosition === 'left' || (last.node.getId() === root.getId()) ? 0 : (1.1 * nodeWidth)),
        y: last.y - (rootPosition === 'left' || (last.node.getId() === root.getId()) ? (1.2 * nodeHeight) : 0)
      });
      nodes.push(n)
      edges.push([n, last])
      last = n;
    }, this)
    debug('end compute graph');
    return {
      nodeViews: nodes,
      edgeViews: edges
    }
  }

  getCharacteristic(levelArray, maxLabelTextLines, dimensions, margins, rootPosition) {

    if (rootPosition === 'corner') {
      return getCharacteristicCorner();
    } else if (rootPosition === 'top') {
      return getCharacteristicTop();
    }

    let widthFactor = 2; //TODO change this if we want square nodes for certain root positions;
    let maxNodeHeight = maxLabelTextLines * LABEL_SIZE_DEFAULT * LINE_HEIGHT_FACTOR;
    let maxNodeWidth = widthFactor * maxNodeHeight;

    //setup
    let w = dimensions.graphWidth - margins.l - margins.r;
    let h = dimensions.graphHeight - margins.t - margins.b;

    let lineLength = h; // pixes for line dimension
    let levelSpace = w; // pixels for levels dimension

    const NODE_SPACE_FACTOR = 1.2; // we want at least 30% space between nodes if we can get it.
    const LEVEL_SPACE_MIN = 20;

    let c = {}
    let levelLength = 0
    levelArray.forEach((levelNodes, level) => {
      levelLength = Math.max(levelNodes.length, levelLength);
      let linesPerNode = Math.min(
        maxLabelTextLines,
        Math.max(
          Math.floor(lineLength / (levelLength * LABEL_SIZE_DEFAULT * LINE_HEIGHT_FACTOR * NODE_SPACE_FACTOR)),
          1
        )
      )
      c[level] = {
        linesPerNode: linesPerNode,
        levelLength: levelLength
      };
    })

    let extraLevelSpace = (levels, levelSpace) => {
      let minSpaceBetweenLevels = (levels.length - 1) * LEVEL_SPACE_MIN;
      let totalWidthOfLevels = Object.values(c).map(ch => ch.linesPerNode).reduce((acc, l) => (acc + l * widthFactor * LABEL_SIZE_DEFAULT * LINE_HEIGHT_FACTOR), 0)
      return levelSpace - totalWidthOfLevels - minSpaceBetweenLevels;
    }

    let extraSpaceDepth = extraLevelSpace(levelArray, levelSpace);
    while (extraSpaceDepth < 0) {
      let keyToDecrement = Object.keys(c).find(key => c[key].linesPerNode > 1)
      if (typeof keyToDecrement !== 'undefined') {
        c[keyToDecrement].linesPerNode = c[keyToDecrement].linesPerNode - 1;
      } else {
        break;
      }
      extraSpaceDepth = extraLevelSpace(levelArray, levelSpace);
    }

    const LEVEL_SPACE_FACTOR = 0.7;
    let oneNodeSublevels = levelArray.map(arr => arr.filter(n=>n.isIncludedSelf()).length).findIndex((len, i) => len > 1 && i > 0);
    oneNodeSublevels = Math.max(oneNodeSublevels, 1);

    let extraSpaceBefore = (level) => {
      let levelsToSpace = (level >= oneNodeSublevels && extraSpaceDepth > 0)
        ? Math.pow(LEVEL_SPACE_FACTOR, level - oneNodeSublevels)
        : 0;
      return levelsToSpace * extraSpaceDepth * (1 - LEVEL_SPACE_FACTOR)/(1 - Math.pow(LEVEL_SPACE_FACTOR, levelArray.length));
    }
    let offset = 0;
    for (let level in c) {
      c[level].height = (c[level].linesPerNode * LINE_HEIGHT_FACTOR) * LABEL_SIZE_DEFAULT;
      c[level].width = c[level].height * widthFactor;
      c[level].extraSpace = lineLength - c[level].height * c[level].levelLength * NODE_SPACE_FACTOR;
      c[level].nodeDeltaFrac = c[level].height * NODE_SPACE_FACTOR / lineLength;
      c[level].lineLength = lineLength;
      c[level].offset = offset;
      offset += c[level].width + LEVEL_SPACE_MIN + extraSpaceBefore(parseInt(level) + 1);
    }
    debug('characteristic', c)
    return c;
  }

  overlaps(nv1, nv2) {
    let overlapFactor = 0.8;
    let x1 = Math.min(nv1.x, nv2.x);
    let x2 = Math.max(nv1.x, nv2.x);
    let y1 = Math.min(nv1.y, nv2.y);
    let y2 = Math.max(nv1.y, nv2.y);
    return (y2 - y1) < overlapFactor * (nv1.height + nv2.height) / 2 && (x2 - x1) < overlapFactor * (nv1.width + nv2.width) / 2;
  }
}

class NodeView {
  constructor(props, graphView) {
    this.graphView = graphView;
    this.node = props.node;
    this.hasFocus = ()=>(props.hasFocus || (graphView && graphView.nodeIsFocused(this.node)));
    this.label = props.label || this.hasFocus();
    this.labelSize = props.labelSize;

    this.pathFrac = props.pathFrac;

    this.width = props.width;
    this.height = props.height;
    this.edgeOffsetX = props.edgeOffsetX || 0;
    this.edgeOffsetY = props.edgeOffsetY || 0;
    this.x = props.x;
    this.y = props.y;
  }
}

class InfoBoxEntry {
  constructor(props = {}) {
    this.state = {
      key: props.key || null,
      value: props.value || null,
      class: props.class || null,
      link: props.link || null
    }
  }
}

class InfoBox {
  constructor(props = {}) {
    this.state = {
      title: props.title || null,
      limitedKeys: props.limitedKeys || null,
      entries: props.entries || {},
      links: props.links || {}
    }
  }

  getEntries() {
    return this.state.entries;
  }

  addEntry(name, value, link = null) {
    this.state.entries[name] = value;
    if (link !== null) {
      this.state.links[name] = link;
    }
  }
}

InfoBox.of = function(node, mainKey = null, dataKeySelectFunc = (keys=>keys), limitedKeys = null, dataCleanFunc = ((val, key)=>val), parentKey = 'parent', childKey = 'children', descendentKey = 'descendents') {
  let title = (mainKey === null) ? node.getId() : node.getAttribute(mainKey).trim();
  let mainKeyLabel = (mainKey === null) ? 'id' : mainKey;
  let infoBox = new InfoBox({
    title: title,
    limitedKeys: limitedKeys,
  });

  //top datum
  infoBox.addEntry(mainKeyLabel, title, node);

  //ancestor data
  if (node.constructor.name === 'MkTreeNode') {
    if (!node.isRoot()) {
      let parent = node.getParent();
      let indent = ""
      while (parent != null) {
        let key = parentKey + (indent.length > 0 ? " (" + ((indent.length/6)+1) + ")" : '')
        let parentTitle = (mainKey === null) ? parent.getId() : parent.getAttribute(mainKey).trim();
        infoBox.addEntry(key, indent + parentTitle, parent);
        parent = parent.getParent();
        indent = indent + "&nbsp;";
      }
    }
    //descendent data
    let children = node.getChildren(true);
    if (children.length > 0) {
        infoBox.addEntry(childKey, children.length, children);
        let descendents = node.getDescendents(true);
        infoBox.addEntry(descendentKey, descendents.length, descendents);
    }
  }
  //other data
  let otherDataKeys = dataKeySelectFunc(Object.keys(node.getAttributes()))
  otherDataKeys.forEach(key=>{
    let val = dataCleanFunc(node.getAttribute(key), key);
    if (val != null) {
      infoBox.addEntry(key, val);
    }
  })

  return infoBox;
}

//cdnjs.cloudflare.com/ajax/libs/seedrandom/2.3.10/seedrandom.js
//TODO make this private
!function(a,b,c,d,e,f,g,h,i){function j(a){var b,c=a.length,e=this,f=0,g=e.i=e.j=0,h=e.S=[];for(c||(a=[c++]);d>f;)h[f]=f++;for(f=0;d>f;f++)h[f]=h[g=s&g+a[f%c]+(b=h[f])],h[g]=b;(e.g=function(a){for(var b,c=0,f=e.i,g=e.j,h=e.S;a--;)b=h[f=s&f+1],c=c*d+h[s&(h[f]=h[g=s&g+b])+(h[g]=b)];return e.i=f,e.j=g,c})(d)}function k(a,b){var c,d=[],e=typeof a;if(b&&"object"==e)for(c in a)try{d.push(k(a[c],b-1))}catch(f){}return d.length?d:"string"==e?a:a+"\0"}function l(a,b){for(var c,d=a+"",e=0;e<d.length;)b[s&e]=s&(c^=19*b[s&e])+d.charCodeAt(e++);return n(b)}function m(c){try{return o?n(o.randomBytes(d)):(a.crypto.getRandomValues(c=new Uint8Array(d)),n(c))}catch(e){return[+new Date,a,(c=a.navigator)&&c.plugins,a.screen,n(b)]}}function n(a){return String.fromCharCode.apply(0,a)}var o,p=c.pow(d,e),q=c.pow(2,f),r=2*q,s=d-1,t=c["seed"+i]=function(a,f,g){var h=[];f=1==f?{entropy:!0}:f||{};var o=l(k(f.entropy?[a,n(b)]:null==a?m():a,3),h),s=new j(h);return l(n(s.S),b),(f.pass||g||function(a,b,d){return d?(c[i]=a,b):a})(function(){for(var a=s.g(e),b=p,c=0;q>a;)a=(a+c)*d,b*=d,c=s.g(1);for(;a>=r;)a/=2,b/=2,c>>>=1;return(a+c)/b},o,"global"in f?f.global:this==c)};if(l(c[i](),b),g&&g.exports){g.exports=t;try{o=require("crypto")}catch(u){}}else h&&h.amd&&h(function(){return t})}(this,[],Math,256,6,52,"object"==typeof module&&module,"function"==typeof define&&define,"random");

MkTree.generateRandomTree = function(size, //total number of nodes in trees
    levelCount, //total number of levels in tree
    perLevelCount = null, //array of length <levelCount> OR function name (linear, quadratic, exponential, log, asymptotic) OR function(levelNumber) => numberOfNodes
    childProbDist = null) { //function with domain [0, levelCount - 1]...
  if (perLevelCount === null) {
    perLevelCount = (level)=>(2 << level);
  } else if (Array.isArray(perLevelCount)) {
    let levelCountArray = perLevelCount;
    perLevelCount = (level)=>(levelCountArray[level]);
  }
  let tree = new MkTree();
  let lastLevel = null;
  let currentLevel = [];
  let nodesAdded = 0;
  let currentLevelIndex = 0;
  let rootNode;

  //TODO consider the possibility that the strongest correlation in an organization might be: the more siblings you have and the farther from root you are, the less likely you are to be a parent

  while (nodesAdded < size) {
    let nodeId = "L" + currentLevelIndex + "N" + currentLevel.length;
    let node = new MkTreeNode({id: nodeId, attributes: {id: nodeId}, graph: tree});
    currentLevel.push(node);
    nodesAdded++;

    if (currentLevelIndex !== 0) {
      let potentialParents = childProbDist ? childProbDist[currentLevelIndex - 1] : lastLevel.length;
      let parent = lastLevel[Math.floor((Math.pow(Math.random(),2))*potentialParents)];
      parent.addChild(node);
      d3.shuffle(parent.state.children);
    } else {
      rootNode = node;
    }

    if (currentLevelIndex === 0 ||
        (currentLevelIndex !== levelCount - 1 && perLevelCount(currentLevelIndex) <= currentLevel.length)) {
      //incrementLevel
      currentLevelIndex++;
      lastLevel = currentLevel;
      currentLevel = [];
    }
  }

  return tree;
}

debug('loaded script');
