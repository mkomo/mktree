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

//The innards of a node are immutable
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
  
  getNodes() {
    return this.state.nodes;
  }

  getNode(nodeId) {
    return this.state.nodes[nodeId];
  }

  getFilters() {
    return this.state.filters;
  }
}

class MkTree extends MkGraph {
  constructor(props = {}) {
    super(props);
    this.state = Object.assign(this.state, {
      root: props.root || null
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

class MkGraphView {
  constructor(props) {
    this.state = {
      graph: props.graph,
      title: props.title || 'Graph',
      colorFunction: props.colorFunction || function(d) {
        return '#999';
      },
      label: props.label || function(d) {
        return d.node.getId();
      },
      tooltip: props.tooltip || function(node) {
        return node.getId();
      },
      infoBox: props.infoBox || function(node) {
        return InfoBox.of(node);
      },
      searchFields: props.searchFields || null,
      search: props.search || null,
      searchSort: props.searchSort || null,
      focusNodes: props.focusNodes || [],
      infoBoxNode: props.infoBoxNode || [],
      filters: props.filters || {},
      filtersOn: props.filtersOn || [],
      parentDomElement: props.parentDomElement || document.body
    }
    this.state.filters['focus'] = function(node) {
      return view.state.focusNodes.length == 0 || view.state.focusNodes.includes(node);
    };

    let view = this;
    this.svg = d3.select(this.state.parentDomElement).append("svg")
      .attr("id", 'graph_svg')
      .on('click', function(){
        view.setState({
          focusNodes: []
        })
      })
    this.state.dimensions = this.getDimensions();
    d3.select("body").on('mouseover', d=>view.hover());
    this.container = this.svg.append('g');

    this.sideBar = d3.select("body").append("div")
      .attr("id", 'info_box');

    this.searchBox = this.sideBar.append('input').attr('class', 'info_element')
      .attr('placeholder', 'search graph');

    this.searchBox.on('keypress', function(e){
      if (!e) e = window.event;
      var keyCode = e.keyCode || e.which;
      if (keyCode == '13'){
        view.search(view.searchBox.property('value'));
        return false;
      }
    })

    this.titleBox = this.sideBar.append('div').attr('class', 'info_element');
    this.titleBox.append('h2').attr('id', 'info_box_title');

    this.infoBox = this.sideBar.append('table').attr('class', 'info_element');

    let tooltip = d3.select("body").append("span")
      .attr("id", 'tooltip');
    this.tooltip = tooltip;
    d3.select("body").on('mousemove', function(){
      tooltip
        .style("left", (d3.event.pageX + 28) + "px")
        .style("top", (d3.event.pageY + 28) + "px");
    })

    window.addEventListener("resize", e=>(view.updateDimensions()));

    this.updateDimensions = this.updateDimensions.bind(this);
    this.updateFocus = this.updateFocus.bind(this);
    this.isVisibleInGraphState = this.isVisibleInGraphState.bind(this);
    this.render = this.render.bind(this);
    this.isEqual = this.isEqual.bind(this);
    this.search = this.search.bind(this);
    this.hover = this.hover.bind(this);
    this.hoverDelegate = this.hoverDelegate.bind(this);
    this.click = this.click.bind(this);
    this.dblclick = this.dblclick.bind(this);
  }

  updateDimensions() {
    let oldDim = this.state.dimensions;
    let newDim = this.getDimensions();

    if (Object.keys(oldDim).some(key=>(oldDim[key] != newDim[key]))) {
      this.setState({
        dimensions: newDim
      });
    }
  }

  getDimensions() {
    return {
      width: window.innerWidth,
      graphWidth: window.innerWidth * 0.66,
      height: window.innerHeight -
        (document.getElementById('graph_svg').getBoundingClientRect().top -
          document.body.getBoundingClientRect().top)
    }
  }

  getGraph() {
    return this.state.graph;
  }

  /**
   * test states
    rootId=EMTGJNA&filtersOn=humans //spread for huge number of child nodes
    rootId=TDEVY67&filtersOn=humans //crowd childless nodes and center on parent node
   */
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
      let queryState=this.getQueryState();
      let queryString = Object.keys(queryState)
        .filter(key=>(queryState[key] != null && queryState[key].length != 0))
        .map(key=>(encodeURIComponent(key) + '=' + encodeURIComponent(queryState[key]))).join('&');
      debug('setState', queryString);
      this.render(changed);
    }
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

  searchCriteria(criteriaString) {
    //get separate terms in lowercase
    let criteria = criteriaString.toLowerCase().split(';');
    //trim criteria
    criteria = criteria.map(t=>t.trim())
    //email special case TODO move this out into some settable search functions
    criteria = criteria.map(e=>(e.includes('<') ? e.split('<')[1].split('>')[0]: e))
    //split into bundled terms
    criteria = criteria.map(e=>e.split(/[\s]+/));
    return criteria;
  }

  search(criteriaString) {
    debug('search starting');
    let criteria = this.searchCriteria(criteriaString)

    let searchFields = this.state.searchFields;
    let nodes = [];
    Object.values(this.getGraph().getNodes()).forEach(function(node){
      // search
      for (let key in node.getAttributes()) {
        if ((searchFields == null || searchFields.includes(key))
            && criteria.some(criterion=>criterion.every(term => node.getAttributes()[key].toLowerCase().includes(term)))) {
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
    this.setState({
      search: criteriaString,
      focusNodes: nodes
    })
  }
  
  shouldRedraw(stateChanged) {
    const GRAPH_AFFECTING_STATE = ["colorFunction", "label", "filters", "filtersOn", "dimensions"];
    return !stateChanged || stateChanged.some(key=>GRAPH_AFFECTING_STATE.includes(key));
  }

  isVisibleInGraphState(node) {
    return true; //TODO
  }

  //called by draw
  updateFocus(shouldRedraw = true) {
    debug('start infoBox');
    let view = this;
    let root = this.state.root;

    let focusNodesVisible = [];
    let excludingFilters = {};
    view.state.focusNodes.forEach(node => {
      if (!node.isIncludedSelf()) {
        node.getExcludingFilters().forEach(filterName => {
          excludingFilters[filterName] = true;
        })
      } else if (view.isVisibleInGraphState(node)) {
        //node is on screen, but might be in a group node
        shouldRedraw = shouldRedraw || (view.container.selectAll('rect#' + node.getId()).size() == 0);
        focusNodesVisible.push(node);
      } else {
        //node is off screen
      }
    });
    excludingFilters = Object.keys(excludingFilters);
    let focusNodesNotVisible = this.state.focusNodes.filter(node=>!focusNodesVisible.includes(node));

    let labelClass = 'label';
    let info;
    if (this.state.focusNodes.length > 1) {
      //more than one focus node
      labelClass = 'label_narrow';
      info = new InfoBox({
        title: "found " + this.state.focusNodes.length + ' results' + (focusNodesNotVisible.length > 0 ? ' (showing ' + focusNodesVisible.length + ')':'')
      });
      let orderedNodes = focusNodesVisible.concat(focusNodesNotVisible); //
      orderedNodes.forEach((node, i) => {
        let ib = this.state.infoBox(node);
        let key = (i < focusNodesVisible.length) ? i+1 : ('x ' + (i - focusNodesVisible.length + 1));
        info.addEntry(key + ':', ib.state.title, node);
        info.addEntry(key + '.', Object.keys(ib.state.entries).filter(k=>(ib.state.limitedKeys === null || ib.state.limitedKeys.includes(k))).map(k=>ib.state.entries[k]).join('; '));
      });
    } else if (this.state.focusNodes.length == 1) {
      //one focus node
      info = this.state.infoBox(this.state.focusNodes[0]);
      if (Object.keys(info.getEntries()).length == 0) {
        info.addEntry('attributes', '(empty)');
      };
    } else {
      //no focus node
      info = new InfoBox({
        title: this.state.title,
      });
      //TODO consider possibility that this is a failed search
      //todo fix this for case that 'focus' filter is on
      this.appendGraphData(info);
      Object.keys(view.state.filters).forEach((filterName, index)=>{
        let filterKey = 'filter (' + index + ')';
        if (!view.state.filtersOn.includes(filterName)) {
          info.addEntry(filterKey, filterName, function(){
            view.addFilter(filterName);
          });
        } else {
          info.addEntry(filterKey, filterName + ' (remove)', function(){
            view.removeFilter(filterName);
          });
        }
      })

    }

    //Set Title
    var title = this.titleBox.selectAll("h2#info_box_title").data([info.state.title]).text(d=>d);

    //Set filters
    let plural = view.state.focusNodes.length > 1;

    let options = [];
    if (focusNodesNotVisible.length > 0) {
      options.push([plural ? 'expand graph to all search results' : 'move to search result', function(){
        let newState = view.getStateToUnhideNodes(focusNodesNotVisible)
        newState.filtersOn = view.state.filtersOn.filter(filterName=>!excludingFilters.includes(filterName));
        view.setState(newState);
      }]);
    }
    if (view.state.filtersOn.includes('focus')) {
      options.push(['don\'t limit to search results', function(){
        view.removeFilter('focus');
      }]);
    } else if (plural) {
      options.push(['only show search results', function(){
        view.addFilter('focus');
        d3.event.preventDefault();
      }]);
    }
    var link = this.titleBox.selectAll("a.info_box_filter").data(options);
    link.exit().remove();
    link.enter().append('a')
      .attr('class', 'info_box_filter')
      .attr('href', '#')
    .merge(link)
      .text(d=>d[0])
      .on('click', d=>{
        d3.event.stopPropagation();
        d[1]();
      });
    //var filterLink = this.sideBar.select("a#info_box_title").data([info.state.title]);

    let d3entries = this.infoBox.selectAll("tr").data(Object.keys(info.getEntries()));

    d3entries.exit().remove();

    let rows = d3entries.enter().append("tr")
      .attr("class", 'datum')
    .merge(d3entries)

    d3entries = rows.selectAll('td')
      .data(function (row) {
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
                view.click(link);
              } else if (typeof link == 'function') {
                link.call(view);
              } else {
                view.dblclick(link);
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
                //TODO we switch double clicking behavior on links. that's bad right?
                view.click([link]);
              }
            }
          })
    //TODO call class of nodes instead of 'rect' so I can change
    this.container.selectAll("rect")
      .classed('focus', d=> (view.state.focusNodes.includes(d.node)));

    debug('end infoBox')
    return shouldRedraw;
  }

  appendGraphData(info) {
    //TODO
  }

  getStateToUnhideNodes(nodesToUnhide) {
    return {};
  }

  //TODO clean this up -- obviously just a test
  getNodePositions() {
    let view = this;
    let edgeViews = [];
    let nodeViews = [];
    let dimensions = this.state.dimensions;

    let margins = {
      l: 24,
      r: 24,
      t: 24,
      b: 24
    };
    
    let ancestorRadius = 20;
    let width = dimensions.graphWidth - margins.l - margins.r;
    let x = margins.l + ancestorRadius;
    let y = margins.t + ancestorRadius;
    let last = null;

    let nodes = Object.values(this.getGraph().getNodes()).filter(node=>node.isIncludedSelf());
    if (this.state.searchSort) {
      nodes.sort(this.state.searchSort);
    } else {
      nodes.sort();
    }
    nodes.forEach((node, i) => {
      if (y < dimensions.height - margins.t) {
        let n = {
          node: node,
          label: true,
          labelSize: 10,
          angle: 0,
          r: ancestorRadius,
          x: x,
          y: y // use bottom margin, since these are the nodes along the top
        }
        nodeViews.push(n)
        if (last !== null) {
          edgeViews.push([last, n])
        }
        last = n;
        if (x > width - ancestorRadius) {
          x = margins.l + ancestorRadius;
          y += ancestorRadius * 2.5;
        } else {
          x += ancestorRadius * 2.5;
        }
      }
    })
    debug('end compute graph');
    return {
      nodeViews: nodeViews,
      edgeViews: edgeViews
    }
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

  hoverDelegate(delegate) {
    //TODO consider what clustered nodes mean in a non-tree graph
    this.hover(delegate, 'cluster containing ');
  }
  
  click(nodes, prefix = null, suffix = null) {
    d3.event.stopPropagation();
    this.setState({
      focusNodes: nodes,
      search: null
    })
  }

  dblclick(node, prefix = null, suffix = null) {
    d3.event.stopPropagation();
    //todo what should happen on dblclick in a graph?
  }

  getQueryState() {
    return {
      filtersOn: this.state.filtersOn.join(','),
      search: this.state.search,
      focusNodeIds: this.state.focusNodes.map(node=>node.getId()).join(',')
    }
  }

  //called by setState. also should be called when setState is not called but graph should be rerendered.
  render(changed) {
    debug('render', changed);
    //todo add loading spinner
    if (!changed || (changed && changed.includes('dimensions'))) {
      var d = this.state.dimensions;

      this.svg
        .attr("width", d.width)
        .attr("height", d.height)
        .attr("tabindex", 1);
      debug('resize done');
    }

    let activeFilters = {};
    this.state.filtersOn.forEach(filterName=> {
      activeFilters[filterName] = this.state.filters[filterName];
      console.log('activeFilters', activeFilters);
    })
    this.getGraph().setFilters(activeFilters);

    let shouldRedraw = this.shouldRedraw(changed);
    shouldRedraw = this.updateFocus(shouldRedraw);

    //todo remove loading spinner
    if (shouldRedraw) {
      let view = this;
      setTimeout(()=>{
        view.drawGraphElements();
      }, 10);
    }
  }

  addFilter(name) {
    if (!this.state.filtersOn.includes(name)) {
      this.state.filtersOn.push(name);
      this.render(['filtersOn']);
    }
  }

  //convenience method.
  removeFilter(name) {
    if (this.state.filtersOn.includes(name)) {
      this.state.filtersOn.splice(this.state.filtersOn.indexOf(name), 1);
      this.render(['filtersOn']);
    }
  }

  drawGraphElements() {
    let view = this;
    let nodePositions = view.getNodePositions()
    let nodes = nodePositions.nodeViews;
    let edges = nodePositions.edgeViews;

    const CLASSES = {
        line: 'edge'
      };
    //TODO get rid of isAncestor -- doesn't make sense outside the context of a tree
    var line = d3.line()
      .x((d,index)=>{
        return d.x + (d.isAncestor ? 0 : (index == 0 ? 1 : -1)) * (d.r - 1);
      })
      .y((d, index)=>(d.y + (d.isAncestor ? 0 : (index == 0 ? 1 : -1)) * (d.r - 1)));

    let t = this.svg.transition().duration(750);

    //EDGES
    var edge = this.container.selectAll("path." + CLASSES.line)
      .data(edges.filter(edge => {
        return !(edge[1].isHidden) && !('span' in edge[1]);
      }), d => {
        return `${d[0].node.getId()},${d[1].node.getId()}`;
      });

    edge.exit().remove();

    edge.enter().append("path")
      .attr("class", CLASSES.line)
      .style('stroke', d=>{
        return view.state.colorFunction(d[1]);
      })
      .style('stroke-width','1.5px')
      .style('opacity',0)
      .transition(t)
          .delay(500)
        .style('opacity', d => d[0].node.isIncludedSelf() ? 0.5 : 0.1)
          .selection()
    .merge(edge)
      .transition(t)
        .style('opacity', d => d[0].node.isIncludedSelf() ? 0.5 : 0.1)
        .attr("d", function(a) {
          return line(a);
        });

    /*GROUP EDGES*/
    var groupEdges = this.container.selectAll("polygon.group_edge")
      .data(edges.filter(d => {
        return 'span' in d[1];
      }), d => {
        return `${d[0].node.getId()},${d[1].node.getId()}`;
      });

    groupEdges.exit().remove();

    groupEdges.enter().append("polygon")
      .attr("class", 'group_edge')
      .classed('clickable', true)
      .style('fill', d=>{
        return view.state.colorFunction(d[1]);
      })
      .style('opacity',0)
      .on('mouseover', d=> view.hoverDelegate(d[0].node))
      .on('click', d => view.click([d[0].node]))
      .on('dblclick', d => view.dblclick(d[0].node))
      .transition(t)
          .delay(500)
        .style('opacity', d => d[0].node.isIncludedSelf() ? 0.5 : 0.1)
          .selection()
    .merge(groupEdges)
      .transition(t)
        .attr("points", function(d) {
          let node;
          //TODO allow spans from source nodes as well.
          node = d[0]; let a = [node.x + node.r, node.y + node.r];
          node = d[1]; let b = [node.x - node.r, node.y - node.r];
          node = d[1].span; let c = [node.x - node.r, node.y - node.r];
          return [a, b, c].map(coord => coord.join(',')).join(' ')
        })
        .style('opacity', d => d[0].node.isIncludedSelf() ? 0.5 : 0.1);

    //TODO don't remove till after transition?

    //GROUP NODES
    var groupNodes = this.container.selectAll("polygon.group_node")
      .data(nodes.filter(d => {
        return 'span' in d;
      }), d => d.node.getId());

    groupNodes.exit().remove();

    groupNodes.enter().append("polygon")
      .attr("class", 'group_node')
      .classed('clickable', true)
      .style('fill', view.state.colorFunction)
      .style('opacity',0)
      .on('mouseover', d=>view.hoverDelegate(d.delegate))
      .on('click', d => view.click([d.delegate]))
      .on('dblclick', d => view.dblclick(d.delegate))
      .transition(t)
          .delay(500)
        .style('opacity', d => d.delegate.isIncludedSelf() ? 1 : 0.2)
          .selection()
    .merge(groupNodes)
      .transition(t)
        .attr("points", function(n) {
          let a = {x:n.x-n.r,y:n.y-n.r};
          let b = {x:n.x+n.r,y:n.y+n.r};
          let c = {x:n.span.x+n.r,y:n.span.y+n.span.r};
          let d = {x:n.span.x-n.r,y:n.span.y-n.span.r};
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
    var circle = this.container.selectAll("rect")
      .data(nodes.filter(node => {
        return (!node.isHidden && !('span' in node)) || node.hasFocus;
      }), d => d.node.getId());

    circle.exit().remove();
    circle
      .classed('focus', d=>d.hasFocus)
      .transition(t)
          .attr("x", function(d) {
            return d.x - d.r - (d.hasFocus ? 1 : 0);
          })
          .attr("y", function(d) {
            return d.y - d.r - (d.hasFocus ? 1 : 0);
          })
          .attr("width", function(d){
            return d.r * 2 + (d.hasFocus ? 2 : 0);
          })
          .attr("height", function(d){
            return d.r * 2 + (d.hasFocus ? 2 : 0);
          })
          .style('opacity', d => d.node.isIncludedSelf() || d.hasFocus ? 1 : 0.2)
          .style('fill', view.state.colorFunction)
      .selection().raise();

    circle.enter().append("rect")
      .classed('node', true)
      .classed('clickable', true)
      .classed('focus', d=>d.hasFocus)
      .on('mouseover', d=> view.hover(d.node))
      .on('click', d => view.click([d.node]))
      .on('dblclick', d => view.dblclick(d.node))
      .attr('id', d => d.node.getId())
      .attr("x", function(d) {
        return d.x - d.r - (d.hasFocus ? 1 : 0);
      })
      .attr("y", function(d) {
        return d.y - d.r - (d.hasFocus ? 1 : 0);
      })
      .attr("width", function(d){
        return d.r * 2 + (d.hasFocus ? 2 : 0);
      })
      .attr("height", function(d){
        return d.r * 2 + (d.hasFocus ? 2 : 0);
      })
      .style('fill', view.state.colorFunction)
      .style('opacity',0)
      .transition(t)
          .delay(500)
        .style('opacity', d => d.node.isIncludedSelf() ? 1 : 0.2)
      .selection().raise();

    //LABELS
    var nodelabels = this.container.selectAll("text")
      .data(nodes.filter(d => {
        return (d.isHidden !== false) && !('span' in d) && d.label;
      }), d => d.node.getId());

    nodelabels.exit().remove();

    nodelabels.enter().append("text")
      .attr("class", 'nodelabel')
      .classed('clickable', true)
      .on('mouseover', d => view.hover(d.node))
      .on('click', d => view.click([d.node]))
      .on('dblclick', d => view.dblclick(d.node))
      .attr("x", function(d){
        if (d.r > MIN_RADIUS_CENTER_TEXT) {
          return d.x;
        }
        return d.x + d.r;
      })
      .attr("y", function(d){
        if (d.r > MIN_RADIUS_CENTER_TEXT) {
          return d.y;
        }
        return d.y - d.r;
      })
      .style('opacity',0)
      .transition(t)
          .delay(500)
        .style('opacity', d => d.node.isIncludedSelf() ? 1 : 0.8)
          .selection()
    .merge(nodelabels)
      .each(function(d, i){
        let textNode = d3.select(this);
        let lineHeight = d.labelSize * 1.2;
        let labelLength = d.r * 2.0 / lineHeight > 2 ? 2 : 1;
        let label = view.state.label(d, labelLength);
        label = Array.isArray(label) ? label : [label, ''];
        var tspans = textNode.selectAll("tspan")
            .data(label);
        tspans.exit().remove();
        tspans.enter().append('tspan')
          //.attr('dx', 0)
          //.attr('x', d.x)
        .merge(tspans)
          .text(line=>line)
          .attr('dy', (line,i)=>{
            return i == 0 ? (1 - label.filter(l=>l && l.length > 0).length) * 0.5 * lineHeight : lineHeight;
          })
          .attr("text-anchor", d.r > MIN_RADIUS_CENTER_TEXT ? "middle" : "start")
          .attr("alignment-baseline", "middle")
          .transition(t)
            .attr('x', d.x);
      })
      .style('font-size', d => d.labelSize)
      .style('fill', d=> {
        if (d.r >= MIN_RADIUS_CENTER_TEXT) {
          if (typeof view.state.colorFunction.textColor === 'function') {
            return view.state.colorFunction.textColor(d);
          } else {
            return MkTreeView.contrastColor(view.state.colorFunction(d));
          }
        } else {
          return "#000";
        }
      })
      .transition(t)
        .style('opacity', d => d.node.isIncludedSelf() ? 1 : 0.8)
        .attr("x", function(d){
          if (d.r > MIN_RADIUS_CENTER_TEXT) {
            return d.x;
          }
          return d.x + d.r;
        })
        .attr("y", function(d){
          if (d.r > MIN_RADIUS_CENTER_TEXT) {
            return d.y;
          }
          return d.y - d.r;
        })
        .selection().raise();

    debug('end draw graph; dom length=', document.body.getElementsByTagName("*").length);

  }

}

//static function providing color
MkGraphView.contrastColor = function(color) {
  let c = d3.color(color);
  return (c.opacity * (c.r + c.g + c.b)/3 > 128) ? '#000' : '#EEE';
}
MkGraphView.colorNodeByAttribute = function(colorAttribute, colors, defaultColor = '#000') {
  let cf = function(d) {
    let attributes = d.node.getAttributes();
    if (colorAttribute in attributes && attributes[colorAttribute].toLowerCase() in colors) {
      return colors[attributes[colorAttribute].toLowerCase()];
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
    return Array.isArray(colorResult) ? colorResult[1] : MkGraphView.contrastColor(colorResult);
  }
  return fun;
}

class MkTreeView extends MkGraphView {

  constructor(props) {
    super(props);
    this.state = Object.assign(this.state, {
      childString: props.childString || 'children',
      root: props.root || this.state.graph.getRoot()
    });
    let view = this;

    this.render = this.render.bind(this);
  }

  getQueryState() {
    return Object.assign(super.getQueryState(), {
        rootId: this.state.root.getId(),
    })
  }

  getStateToUnhideNodes(nodesToUnhide) {
    return {
      root: this.state.focusNodes.reduce((acc, node)=>node.getMrca(acc), null)
    }
  }

  appendGraphData(info) {
    let root = this.state.root;
    let descendents = root.getDescendents();
    descendents.unshift(root);
    info.addEntry('nodes in tree', descendents.length, descendents);
    let ancestors = root.getAncestors();
    if (ancestors.length > 0) {
      info.addEntry('ancestors', ancestors.length, ancestors);
    }
    let levelCount = root.getMaxDepth() + 1;
    info.addEntry('levels visible', levelCount)
  }
  
  shouldRedraw(stateChanged) {
    const GRAPH_AFFECTING_STATE = ["root", "childString"];
    return super.shouldRedraw(stateChanged) || stateChanged.some(key=>GRAPH_AFFECTING_STATE.includes(key));
  }

  levelPath(dimensions, margins, level, levelNodes, maxLevel, maxRadius, levelLength = null, nodes = null) {
    let view = this;
    let root = this.state.root;
    levelLength = levelLength == null ? levelNodes.length : levelLength
    let w = dimensions.graphWidth - margins.l - margins.r;
    let h = dimensions.height - margins.t - margins.b;
    let fracFunc = level => ((1 - 3/(level + 3)));
    let frac = fracFunc(level);
    let maxFrac = maxLevel == 0 ? 1 : fracFunc(maxLevel);

    //linear
    let m = h/(w * 1.0);
    let b = h * frac/maxFrac;
    let bLast = h * (level == 0 ? 0 : fracFunc(level - 1))/maxFrac;
    let bNext = h * fracFunc(level + 1)/maxFrac;
    let theta = Math.atan(m);
    let perpendicularParentOffset = (b - bLast) * Math.cos(theta) * Math.sin(theta);
    let perpendicularChildOffset = (bNext - b) * Math.cos(theta) * Math.sin(theta);
    let xLineEnd = w * frac/maxFrac;
    let length = xLineEnd / Math.cos(theta);
    
    //node size
    let nodeSpacing = (xLineEnd * 1.0)/levelLength
    let radius = maxRadius / (level + 1);
    let generousRadius = Math.min(perpendicularChildOffset, nodeSpacing)/2;
    if (radius < generousRadius) {
      radius = Math.min(maxRadius, generousRadius);
    }

    //
    let extraOffsetByNode = {};
    let offset = 0;
    levelNodes.forEach((node, index)=>{
      let p = node.getParent(root) != null ? nodes[node.getParent(root).getId()] : null;
      if (p != null) {
        let siblings = p.node.getChildren();
        let childIndex = siblings.indexOf(node);
        let maxOffset = xLineEnd - (levelNodes.length - index) * nodeSpacing - index * nodeSpacing;
        let bestOffset = (p.x - margins.l + perpendicularParentOffset) - (index + siblings.length * 0.5 - childIndex) * nodeSpacing;
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

    //TODO optimize view for sparce view: radius based on density;
    //search: Gadiyaram, Hariprasad [contractor] <hgadiyaram_contractor@mtb.com>; Selvaraj, Eujish [contractor] <eselvaraj_contractor@mtb.com>; Mangla, Shashank [contractor] <smangla_contractor@mtb.com>; Black, Brian <bblack@mtb.com>; Sharma, Anoop  [contractor] <asharma10_contractor@mtb.com>; Tomar, Vivek [contractor] <vtomar_contractor@mtb.com>; Foremiak, Lynn <lforemiak@mtb.com>; Aguilera, Ivan <iaguilera@mtb.com>; Narayana, Lakshmi [contractor] <lnarayana_contractor@mtb.com>; Manjunatha, Sandeep [contractor] <smanjunatha_contractor@mtb.com>; Duvvuru, Avinash  [contractor] <aduvvuru2_contractor@mtb.com>
    //debug('level info', level, [levelLength, levelNodes.length], xLineEnd, radius);
    //TODO make this return type a LevelView class, and make a NodeView class;
    return {
      length: length,
      position: function(node, boss) {
        const LABEL_SIZE_FACTOR = 2;
        const LABEL_SIZE_DEFAULT = 10;
        let index = levelNodes.indexOf(node);
        let x = (index + 0.5) * nodeSpacing + (index in extraOffsetByNode ? extraOffsetByNode[index] : 0);

        if (isNaN(x)) {
          console.error('something went wrong', level, levelLength, maxLevel, xLineEnd, maxFrac);
        }
        let labelSize = (radius * LABEL_SIZE_FACTOR > LABEL_SIZE_DEFAULT)
          ? LABEL_SIZE_DEFAULT
          : radius*LABEL_SIZE_FACTOR;
        return {
          node: node,
          hasFocus: view.state.focusNodes.includes(node),
          label: level == 0 || (nodeSpacing > labelSize && radius > 3),
          labelSize: labelSize,
          r: radius,
          x: margins.l + x,
          y: margins.t - m * x + b,
          angle: Math.atan(1/m)*180/Math.PI
        }
      }
    }
  }

  hoverDelegate(delegate) {
    this.hover(delegate, this.state.childString + ' of ');
    //[0].node, , ' (' + d[0].node.getChildren(true).length + ')';
  }

  dblclick(node, prefix = null, suffix = null) {
    d3.event.stopPropagation();
    this.setState({
      root: node
    })
  }

  isVisibleInGraphState(node) {
    return node.getAncestors(true).includes(this.state.root) || this.state.root.getAncestors().includes(node)
  }

  getNodePositions() {
    let view = this;
    let edges = [];
    let nodes = {};
    let dimensions = this.state.dimensions;
    let root = this.state.root;
    let ancestors = root.getAncestors()
    let maxDepth = root.getMaxDepth() + root.getRootDistance();
    
    let maxRadius = 20;
    let ancestorRadius = 20;//TODO make this larger
    let margin = maxRadius * 2;
    let margins = {
      l: margin,
      r: margin,
      t: margin + (ancestors.length == 0 ? 0 : ancestorRadius * 2.5),
      b: margin
    };

    let child = root;
    let maxLevelLength = 0;
    while (child) {
      //unfilter at root level
      let levelNodes = child.getLevelNodes(root, child === root);
      maxLevelLength = levelNodes.length > maxLevelLength ? levelNodes.length : maxLevelLength;
      let level = child.getRootDistance(root);
      child = null;
      //TODO replace totalbreadth mechanism with one that considers consecutive node spacing
      let totalbreadth = 0;
      let shouldGroup = false;
      let levelPath = this.levelPath(dimensions, margins, level, levelNodes, maxDepth, maxRadius, maxLevelLength, nodes);
      let lastX = 0;
      levelNodes.forEach(function(node){
        let nodeView = levelPath.position(node, node.getParent(root) != null ? nodes[node.getParent(root).getId()] : null);
        nodes[node.getId()] = nodeView;
        if (!node.isRoot(root) && node.getParent(root).getId() in nodes) {
          edges.push([nodes[node.getParent(root).getId()], nodeView]);
          if (nodeView.x - lastX < nodeView.r) {
            shouldGroup = true;
          }
        }
        if (!child && node.getChildren().length > 0) {
          child = node.getChildren()[0];
        }
        lastX = nodeView.x;
      });
      //TODO handle case where level 1 does not have enough spread (there's no way to see all those nodes ever)
      if (shouldGroup && level > 1) {
        let lastParent;
        let lastColor;
        let lastNonHidden;
        levelNodes.forEach(function(node){
          if (lastParent && lastColor && lastParent == node.getParent() && lastColor == view.state.colorFunction({node: node})) {
            nodes[node.getId()]['isHidden'] = true;
            lastNonHidden.span = nodes[node.getId()];
          } else {
            lastParent = node.getParent();
            lastColor = view.state.colorFunction({node: node});
            lastNonHidden = nodes[node.getId()];
            lastNonHidden.delegate = lastParent;
          }
        });
      }
      //debug('level summary', levelNodes.length, levelNodes.filter(n=>(n.getChildren().length > 0)).length);
    }

    let last = nodes[root.getId()];
    last.isAncestor = true;

    nodes = Object.values(nodes);
    ancestors.forEach((node, i) => {
      let n = {
        node: node,
        label: true,
        labelSize: 10,
        angle: 0,
        r: ancestorRadius,
        isAncestor: true,
        x: i*2.5*ancestorRadius + margins.l,
        y: margins.b // use bottom margin, since these are the nodes along the top TODO make cleaner
      }
      nodes.push(n)
      edges.push([n, last])
      last = n;
    })
    debug('end compute graph');
    return {
      nodeViews: nodes,
      edgeViews: edges
    }
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
      entries: props.entries || {},
      limitedKeys: props.limitedKeys || [],
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

InfoBox.of = function(node, mainKey = null, parentKey = 'parent', childKey = 'children', descendentKey = 'descendents', dataKeySelectFunc = (keys=>keys), dataCleanFunc = ((val, key)=>val), limitedKeys = null) {
  let title = (mainKey === null) ? node.getId() : node.getAttributes()[mainKey].trim();
  let infoBox = new InfoBox({
    title: title,
    limitedKeys: limitedKeys,
  });

  //top datum
  infoBox.addEntry(mainKey, node.getAttributes()[mainKey], node);

  //ancestor data
  if (!node.isRoot()) {
    let parent = node.getParent();
    let indent = ""
    while (parent != null) {
      let key = parentKey + (indent.length > 0 ? " (" + ((indent.length/6)+1) + ")" : '')
      let parentTitle = (mainKey === null) ? parent.getId() : parent.getAttributes()[mainKey].trim();
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
  //other data
  let otherDataKeys = dataKeySelectFunc(Object.keys(node.getAttributes()))
  otherDataKeys.forEach(key=>{
    let val = dataCleanFunc(node.getAttributes()[key], key);
    if (val != null) {
      infoBox.addEntry(key, val);
    }
  })

  return infoBox;
}

//cdnjs.cloudflare.com/ajax/libs/seedrandom/2.3.10/seedrandom.js
//TODO make this private
!function(a,b,c,d,e,f,g,h,i){function j(a){var b,c=a.length,e=this,f=0,g=e.i=e.j=0,h=e.S=[];for(c||(a=[c++]);d>f;)h[f]=f++;for(f=0;d>f;f++)h[f]=h[g=s&g+a[f%c]+(b=h[f])],h[g]=b;(e.g=function(a){for(var b,c=0,f=e.i,g=e.j,h=e.S;a--;)b=h[f=s&f+1],c=c*d+h[s&(h[f]=h[g=s&g+b])+(h[g]=b)];return e.i=f,e.j=g,c})(d)}function k(a,b){var c,d=[],e=typeof a;if(b&&"object"==e)for(c in a)try{d.push(k(a[c],b-1))}catch(f){}return d.length?d:"string"==e?a:a+"\0"}function l(a,b){for(var c,d=a+"",e=0;e<d.length;)b[s&e]=s&(c^=19*b[s&e])+d.charCodeAt(e++);return n(b)}function m(c){try{return o?n(o.randomBytes(d)):(a.crypto.getRandomValues(c=new Uint8Array(d)),n(c))}catch(e){return[+new Date,a,(c=a.navigator)&&c.plugins,a.screen,n(b)]}}function n(a){return String.fromCharCode.apply(0,a)}var o,p=c.pow(d,e),q=c.pow(2,f),r=2*q,s=d-1,t=c["seed"+i]=function(a,f,g){var h=[];f=1==f?{entropy:!0}:f||{};var o=l(k(f.entropy?[a,n(b)]:null==a?m():a,3),h),s=new j(h);return l(n(s.S),b),(f.pass||g||function(a,b,d){return d?(c[i]=a,b):a})(function(){for(var a=s.g(e),b=p,c=0;q>a;)a=(a+c)*d,b*=d,c=s.g(1);for(;a>=r;)a/=2,b/=2,c>>>=1;return(a+c)/b},o,"global"in f?f.global:this==c)};if(l(c[i](),b),g&&g.exports){g.exports=t;try{o=require("crypto")}catch(u){}}else h&&h.amd&&h(function(){return t})}(this,[],Math,256,6,52,"object"==typeof module&&module,"function"==typeof define&&define,"random");

MkTreeNode.generateRandomTree = function(size, //total number of nodes in trees
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

  return new MkTreeView({graph: tree});
}

debug('loaded script');
