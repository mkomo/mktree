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
Graph: name, subGraphs, nodes, edges, nodeFilters, edgeFilters
  DirectedGraph
    DAG
      Forest
        Tree
GraphView: graph, nodeFiltersActive, edgeFiltersActive
  ForestView:
    TreeView: 
NodeView: nodeId, x, y, radius, label, focusTypes
EdgeView: edgeId
GroupNodeView: nodeIds, radius
GroupEdgeView: sourceNodeId, destNodeIds...
CliqueView: nodeIds, ...
EditableGraphView: nodeViews,
*/
class MkTreeNode {
  constructor(props) {
    this.state = {
      id: props.id,
      parent: props.parent || null,
      data: props.data || {},
      filters: props.filters || [],
      children: []
    }
    this.toString = function() {
      return props.id;
    }
  }

  getId(){
    return this.state.id;
  }

  getData(){
    return this.state.data;
  }

  addChild(node) {
    //TODO allow reordering
    this.state.children.push(node);
    node.setParent(this);
  }

  setParent(node) {
    this.state.parent = node;
  }

  getNodeCount(includeSelf = true) {
    return this.isIncluded() ? this.getDescendents(null, includeSelf).length : 0;
  }
  
  isIncluded(root = this.getRoot()) {
    return this.isIncludedSelf(root) || this.isIncludedFirstDescendent(root);
  }
  
  isIncludedSelf(root = this.getRoot()) {
    return this.getFilters().reduce((acc, f) => (acc && f(this)), true);
  }
  
  isIncludedFirstDescendent(root = this.getRoot()) {    
    return this.getFirst(node=>{
      return node.isIncludedSelf(root);
    }, false) !== null;
  }
  
  setFilters(filters) {
    this.state.filters = filters;
  }

  getFilters() {
      if (this.isRoot()) {
          return this.state.filters.slice();
      } else {
          let pf = this.getParent().getFilters();
          if (this.state.filters.length > 0) {
            this.state.filters.forEach(filter=>{
              pf.push(filter);
            });
          }
          return pf;
      }
  }

  getMaxDepth() {
    if (this.getChildren().length == 0) {
      return 0;
    } else {
      return 1 + this.getChildren().map(n => n.getMaxDepth()).reduce(( max, cur ) => Math.max( max, cur ), 0);
    }
  }

  getRootDistance(root = this.getRoot()) {
    return this === root ? 0 : 1 + this.getParent().getRootDistance(root);
  }

  getLevelNodes(root = this.getRoot()) {
    return root.getDescendents(this.getRootDistance(), true);
  }

  getChildren(unfiltered = false) {
    return this.state.children.filter(c => unfiltered  || (c.isIncluded()));
  }
  
  getMrca(node) {
    if (node == null) {
      return this;
    } else {
      let mine = this.getAncestors(true).reverse();
      let theirs = node.getAncestors(true).reverse();
      let mrca = -1;
      while (mine.length > mrca && theirs.length > mrca && mine[mrca+1] == theirs[mrca+1]){
        mrca ++;
      }
      return mrca >= 0 ? mine[mrca] : null;
    }
  }

  sortChildren(sortFunction) {
    return this.state.children.sort(sortFunction);
  }

  /**
  requires full tree traversal. NOT FILTERED.
   */
  getDescendents(level = null, includeSelf = false) {
    let collector = [];
    let self = this;
    this.dft((node) => {
      if ((level === null || node.getRootDistance() == level) && (includeSelf || node != self)) {
        collector.push(node);
      }
    });
    return collector;
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

  getParent(root = this.getRoot()) {
    return this.isRoot(root) ? null : this.state.parent;
  }

  isRoot(root = this.getRoot()) {
    return this === root;
  }

  getRoot() {
    return this.state.parent === null ? this : this.state.parent.getRoot();
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

  /**
    visits all nodes regardless of whether they are included based on filters
   */
  dft(func, unfiltered = false, args = {}, ref = null) {
    //call function, update args based on function call return value
    args = func.call(ref, this, args);
    this.getChildren(unfiltered).forEach(c => {
      c.dft(func, unfiltered, args, ref);
    });
  }
}

const MAX_RADIUS = 20;
const MIN_RADIUS_CENTER_TEXT = 0;
const MIN_RADIUS_LABEL = 6;

class MkTreeView {

  constructor(props) {
    this.state = {
      //forest: props.forest,
      root: props.root,
      colorFunction: props.colorFunction || function(d) {
        return '#999';
      },
      label: props.label || function(d) {
        return d.node.state.id;
      },
      tooltip: props.tooltip || function(node) {
        return node.state.id;
      },
      infoBox: props.infoBox || function(d) {
          return d.node.state.data;
      },
      title: props.title || 'Tree',
      filters: props.filters || {},
      filtersOn: props.filtersOn || [],
      searchFields: props.searchFields || null,
      search: props.search || null,
      focusNodes: props.focusNodes || [],
      childString: props.childString || 'children',
    }
    this.state.filters['focus'] = function(node) {
      return view.state.focusNodes.length == 0 || view.state.focusNodes.includes(node);
    };

    let view = this;
    this.svg = d3.select("body").append("svg")
      .attr("id", 'graph_svg')
      .on('click', function(){
        view.setState({
          focusNodes: []
        })
      })
    this.state.dimensions = this.getDimensions();
    this.svg.on('mouseover', d=>{view.hover()});
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
    this.render = this.render.bind(this);
    this.isEqual = this.isEqual.bind(this);
    this.search = this.search.bind(this);
    this.hover = this.hover.bind(this);
    
  }

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
      let queryState={
        rootId: this.state.root.getId(),
        filtersOn: this.state.filtersOn.join(','),
        search: this.state.search,
        focusNodeIds: this.state.focusNodes.map(node=>node.getId()).join(',')
      }
      let queryString = Object.keys(queryState)
        .filter(key=>(queryState[key] != null && queryState[key].length != 0))
        .map(key=>(encodeURIComponent(key) + '=' + encodeURIComponent(queryState[key]))).join('&');
      debug('setState', queryString);
      this.render(changed);
    }
  }
  
  addFilter(name) {
    if (!this.state.filtersOn.includes(name)) {
      this.state.filtersOn.push(name);
      this.render(['filtersOn']);
    }
  }
  
  removeFilter(name) {
    if (this.state.filtersOn.includes(name)) {
      this.state.filtersOn.splice(this.state.filtersOn.indexOf(name), 1);
      this.render(['filtersOn']);
    }
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

  search(criteriaString) {
    debug('search starting');
    //get separate terms in lowercase
    let criteria = criteriaString.toLowerCase().split(';');
    //trim criteria
    criteria = criteria.map(t=>t.trim())
    //email special case TODO move this out into some settable search functions
    criteria = criteria.map(e=>(e.includes('<') ? e.split('<')[1].split('>')[0]: e))
    //split into bundled terms
    criteria = criteria.map(e=>e.split(/[\s]+/));
    
    let searchFields = this.state.searchFields;
    let nodes = [];
    root.dft(function(node){
      // search
      for (let key in node.state.data) {
        if ((searchFields == null || searchFields.includes(key)) 
            && criteria.some(criterion=>criterion.every(term => node.state.data[key].toLowerCase().includes(term)))) {
          nodes.push(node);
          return;
        }
      }
    }, true);
    debug('search found ' + nodes.length + ' nodes');
    this.setState({
      search: criteriaString,
      focusNodes: nodes
    })
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
      console.log('resize done');
    }

    let activeFilters = Object.keys(this.state.filters).filter(name=>this.state.filtersOn.includes(name)).map(name=>this.state.filters[name]);
    this.state.root.getRoot().setFilters(activeFilters);

    const GRAPH_AFFECTING_STATE = ["root", "colorFunction", "label", "filters", "filtersOn", "childString", "dimensions"];
    let redraw = !changed || changed.some(key=>GRAPH_AFFECTING_STATE.includes(key));
    this.updateFocus(redraw);
    //todo remove loading spinner
  }

  levelPath(dimensions, margins, level, levelNodes, maxLevel, levelLength = null, nodes = null) {
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

    let extraOffsetByNode = {};
    let offset = 0;
    let nodeSpacing = (xLineEnd * 1.0)/levelLength
    levelNodes.forEach((node, index)=>{
      let p = node.getParent(root) != null ? nodes[node.getParent(root).state.id] : null;
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
    let radius = MAX_RADIUS / (level + 1);
    let generousRadius = Math.min(perpendicularChildOffset, nodeSpacing)/2;
    if (radius < generousRadius) {
      radius = Math.min(MAX_RADIUS, generousRadius);
    }
    
    //TODO optimize view for sparce view: radius based on density; 
    console.log('level info', level, [levelLength, levelNodes.length], xLineEnd, radius);
    //TODO make this return type a LevelView class, and make a NodeView class;
    return {
      length: length,
      position: function(node, boss) {
        const LABEL_SIZE_FACTOR = 2;
        const LABEL_SIZE_DEFAULT = 10;
        let index = levelNodes.indexOf(node);
        let x = (index + 0.5) * nodeSpacing + (index in extraOffsetByNode ? extraOffsetByNode[index] : 0);
        
        if (isNaN(x)) {
          console.log('something went wrong', level, levelLength, maxLevel, xLineEnd, maxFrac);
        }
        let labelSize = (radius * LABEL_SIZE_FACTOR > LABEL_SIZE_DEFAULT)
          ? LABEL_SIZE_DEFAULT + 'px'
          : radius*LABEL_SIZE_FACTOR + 'px';
        //TODO never have a deeper level more spread out than it's parent level
        return {
          node: node,
          label: radius > MIN_RADIUS_LABEL || ((length / (radius * levelLength)) > 3 && radius > 3),
          labelSize: labelSize,
          r: radius,
          x: margins.l + x + radius,
          y: margins.t - m * x + b + radius,
          angle: Math.atan(1/m)*180/Math.PI
        }
      }
    }
  }
  
  hover(node, prefix = null, suffix = null) {
    d3.event.stopPropagation();
    if (node) {
      //TODO set Name as a state property of the view or of the node
      this.tooltip
        .style('display', 'inline-block')
        .text((prefix ? prefix : '') + this.state.tooltip(node) + (suffix ? suffix : ''));
    } else {
      this.tooltip
        .style('display', 'none')
        .text('');
    }
  }

  //called by updateFocus if it's determined that nodes/edges should be redrawn
  drawEdgesAndNodes() {
    debug('start draw graph');
    let view = this;
    let edges = [];
    let nodes = {};
    let dimensions = this.state.dimensions;
    let root = this.state.root;
    let ancestors = root.getAncestors()
    let maxDepth = root.getMaxDepth() + root.getRootDistance();

    let margins = {
      l: 24,
      r: 24,
      t: ancestors.length == 0 ? 24 : 54,
      b: 24
    };

    let child = root;
    let maxLevelLength = 0;
    while (child) {
      let levelNodes = child.getLevelNodes(root);
      maxLevelLength = levelNodes.length > maxLevelLength ? levelNodes.length : maxLevelLength;
      let level = child.getRootDistance(root);
      child = null;
      //TODO replace totalbreadth mechanism with one that considers consecutive node spacing
      let totalbreadth = 0;
      let shouldGroup = false;
      let levelPath = this.levelPath(dimensions, margins, level, levelNodes, maxDepth, maxLevelLength, nodes);
      let lastX = 0;
      levelNodes.forEach(function(node){
        let nodeView = levelPath.position(node, node.getParent(root) != null ? nodes[node.getParent(root).state.id] : null);
        nodes[node.state.id] = nodeView;
        if (!node.isRoot(root) && node.getParent(root).state.id in nodes) {
          edges.push([nodes[node.getParent(root).state.id], nodeView]);
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
            nodes[node.state.id]['isHidden'] = true;
            lastNonHidden.span = nodes[node.state.id];
          } else {
            lastParent = node.getParent();
            lastColor = view.state.colorFunction({node: node});
            lastNonHidden = nodes[node.state.id];
          }
        });
      }
    }
    debug('end traversal');

    let last = nodes[root.state.id];
    last.isAncestor = true;

    nodes = Object.values(nodes);
    let ancestorRadius = 20;
    ancestors.forEach((node, i) => {
      let n = {
        node: node,
        label: true,
        labelSize: 10,
        angle: 0,
        r: ancestorRadius,
        isAncestor: true,
        x: i*2.5*ancestorRadius + margins.l + ancestorRadius,
        y: margins.b // use bottom margin, since these are the nodes along the top
      }
      nodes.push(n)
      edges.push([n, last])
      last = n;
    })
    
    const CLASSES = {
        line: 'edge'
      };
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
        return `${d[0].node.state.id},${d[1].node.state.id}`;
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
        if (!d[0] || !d[1]) {
          console.log('problems', d);
        }
        return `${d[0].node.state.id},${d[1].node.state.id}`;
      });

    groupEdges.exit().remove();
    
    let groupMouseover = function(parent) {
      let childCount = parent.getChildren(true).length;
      view.hover(parent, view.state.childString + ' of ', ' (' + childCount + ')');
    };

    groupEdges.enter().append("polygon")
      .attr("class", 'group_edge')
      .classed('clickable', true)
      .style('fill', d=>{
        return view.state.colorFunction(d[1]);
      })
      .style('opacity',0)
      .on('mouseover', d=>groupMouseover(d[0].node))
      .on('click', function(d) {
        view.setState({
          focusNodes: [d[0].node]
        })
        d3.event.stopPropagation();
      })
      .on('dblclick', function(d) {
        view.setState({
          root: d[0].node
        })
      })
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
      }), d => d.node.state.id);

    groupNodes.exit().remove();

    groupNodes.enter().append("polygon")
      .attr("class", 'group_node')
      .classed('clickable', true)
      .style('fill', view.state.colorFunction)
      .style('opacity',0)
      .on('mouseover', d=>groupMouseover(d.node.getParent()))
      .on('click', function(d) {
        view.setState({
          focusNodes: [d.node.getParent()]
        })
        d3.event.stopPropagation();
      })
      .on('dblclick', function(d) {
        view.setState({
          root: d.node.getParent()
        })
      })
      .transition(t)
          .delay(500)
        .style('opacity', d => d.node.getParent().isIncludedSelf() ? 1 : 0.2)
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
        return (!node.isHidden && !('span' in node)) || view.state.focusNodes.includes(node.node);
      }), d => d.node.state.id);

    circle.exit().remove();
    circle
      .classed('focus', d=>(view.state.focusNodes.includes(d.node)))
      .transition(t)
          .attr("x", function(d) {
            return d.x - d.r - (view.state.focusNodes.includes(d.node) ? 1 : 0);
          })
          .attr("y", function(d) {
            return d.y - d.r - (view.state.focusNodes.includes(d.node) ? 1 : 0);
          })
          .attr("width", function(d){
            return d.r * 2 + (view.state.focusNodes.includes(d.node) ? 2 : 0);
          })
          .attr("height", function(d){
            return d.r * 2 + (view.state.focusNodes.includes(d.node) ? 2 : 0);
          })
          .style('opacity', d => d.node.isIncludedSelf() || view.state.focusNodes.includes(d.node) ? 1 : 0.2)
          .style('fill', view.state.colorFunction)
      .selection().raise();

    circle.enter().append("rect")
      .classed('node', true)
      .classed('clickable', true)
      .classed('focus', d=>(view.state.focusNodes.includes(d.node)))
      .on('mouseover', function(d) {
        view.hover(d.node);
      })
      .on('click', function(d) {
        view.setState({
          focusNodes: [d.node]
        })
        d3.event.stopPropagation();
      })
      .on('dblclick', function(d) {
        view.setState({
          root: d.node
        })
      })
      .attr('id', d => d.node.state.id)
      //TODO figure out how d3 interpolates data
      //.attr("transform", d=>`rotate(${d.angle || 0} ${d.x} ${d.y}) `)
      .attr("x", function(d) {
        return d.x - d.r - (view.state.focusNodes.includes(d.node) ? 1 : 0);
      })
      .attr("y", function(d) {
        return d.y - d.r - (view.state.focusNodes.includes(d.node) ? 1 : 0);
      })
      .attr("width", function(d){
        return d.r * 2 + (view.state.focusNodes.includes(d.node) ? 2 : 0);
      })
      .attr("height", function(d){
        return d.r * 2 + (view.state.focusNodes.includes(d.node) ? 2 : 0);
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
        return d.label;
      }), d => d.node.state.id);

    nodelabels.exit().remove();

    nodelabels.enter().append("text")
      .attr("class", 'nodelabel')
      .classed('clickable', true)
      .on('mouseover', function(d) {
        view.hover(d.node);
      })
      .on('click', function(d) {
        view.setState({
          focusNodes: [d.node]
        })
        d3.event.stopPropagation();
      })
      .on('dblclick', function(d) {
        view.setState({
          root: d.node
        })
      })
      .text(view.state.label)
      .attr("text-anchor", function(d) {
        return d.r > MIN_RADIUS_CENTER_TEXT ? "middle" : "start";
      })
      .attr("alignment-baseline", function(d) {
        return d.r > MIN_RADIUS_CENTER_TEXT ? "middle" : "bottom";
      })
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
      .style('font-size', d => d.labelSize)
      .attr("text-anchor", function(d) {
        return d.r > MIN_RADIUS_CENTER_TEXT ? "middle" : "start";
      })
      .attr("alignment-baseline", function(d) {
        return d.r > MIN_RADIUS_CENTER_TEXT ? "middle" : "bottom";
      })
      .style('fill', d=> {
          let c = d3.color(view.state.colorFunction(d));
          return (d.r <= MIN_RADIUS_CENTER_TEXT || (c.opacity * (c.r + c.g + c.b)/3 > 128)) ? '#000' : '#CCC';
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

  //called by draw
  updateFocus(shouldRedraw = true) {
    debug('start infoBox');
    let view = this;
    let root = this.state.root;

    view.state.focusNodes.forEach(node => {
      shouldRedraw = shouldRedraw || (view.container.selectAll('rect#' + node.state.id).size() == 0);
    });
    
    let nodesUnderRoot = this.state.focusNodes.filter(node=>node.getAncestors(true).includes(root));
    let nodesNotUnderRoot = this.state.focusNodes.filter(node=>!nodesUnderRoot.includes(node));
    let labelClass = 'label';
    let info;
    if (this.state.focusNodes.length > 1) {
      //more than one focus node
      labelClass = 'label_narrow';
      info = new InfoBox({
        title: "found " + this.state.focusNodes.length + ' results' + (nodesNotUnderRoot.length > 0 ? ' (showing ' + nodesUnderRoot.length + ')':'')
      });
      nodesUnderRoot.concat(nodesNotUnderRoot).forEach((node, i) => {
        let ib = this.state.infoBox(node);
        let key = (i < nodesUnderRoot.length) ? i+1 : ('x ' + (i - nodesUnderRoot.length + 1));
        info.state.links[key + ':'] = node;
        info.state.data[key + ':'] = ib.state.title;
        info.state.data[key + '.'] = Object.keys(ib.state.data).filter(k=>ib.state.limitedKeys.includes(k)).map(k=>ib.state.data[k]).join('; ');
      });
    } else if (this.state.focusNodes.length == 1) {
      //one focus node
      info = this.state.infoBox(this.state.focusNodes[0]);
      if (Object.keys(info.state.data).length == 0) {
        info.state.data = {data: '<empty>'};
      };
    } else {
      //no focus node
      //TODO consider possibility that this is a failed search
      let data = {};
      let links = {};
      //todo fix this for case that 'focus' filter is on
      data['nodes visible'] = root.getNodeCount(true) + root.getRootDistance();
      let levelCount = root.getMaxDepth() + 1;
      data['levels visible'] = levelCount
      //for (let i = 0; i < levelCount; i++) data['count @ level '+i] = root.getDescendents(root.getRootDistance() + i, true).length;
      Object.keys(view.state.filters).forEach(filterName=>{
        let filterKey = 'filter by ' + filterName;
        if (!view.state.filtersOn.includes(filterName)) {
          data[filterKey] = filterName;
          links[filterKey] = function(){
            view.addFilter(filterName);
          }
        } else {
          data[filterKey] = 'remove filter ' + filterName;
          links[filterKey] = function(){
            view.removeFilter(filterName);
          }
        }
      })
      info = new InfoBox({
        title: this.state.title,
        data:  data,
        links: links
      });
    }
    
    //Set Title
    var title = this.titleBox.selectAll("h2#info_box_title").data([info.state.title]).text(d=>d);
   
    //Set filters
    let mrca = this.state.focusNodes.reduce((acc, node)=>node.getMrca(acc), null);
    let plural = view.state.focusNodes.length > 1;

    let options = [];
    if (nodesUnderRoot.length < view.state.focusNodes.length) {
      options.push([plural ? 'expand to all results' : 'move to result', function(){
        view.setState({
          root: mrca
        });
      }]);
    }
    if (view.state.filtersOn.includes('focus')) {
      options.push(['show all', function(){
        view.removeFilter('focus');
      }]);
    } else if (plural) {
      options.push(['only show results', function(){
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
        d[1]();
        d3.event.stopPropagation();
      });
    //var filterLink = this.sideBar.select("a#info_box_title").data([info.state.title]);

    var entries = this.infoBox.selectAll("tr").data(Object.keys(info.state.data));

    entries.exit().remove();

    let rows = entries.enter().append("tr")
      .attr("class", 'datum')
    .merge(entries)
    entries = rows.selectAll('td')
      .data(function (row) {
        let link = info.state.links[row];
        if (link) {
          return [[row, labelClass], [info.state.data[row], 'link', link]]
        } else {
          return [[row, labelClass], [info.state.data[row]]]
        }
      })
    entries
      .enter()
          .append('td')
      .merge(entries)
          .html(d => d[0])
          .attr('class', d=>(d.length > 1 ? d[1] : null))
          .on('click', d=>{
            if (d.length > 2) {
              let link = d[2];
              if (Array.isArray(link)) {
                view.setState({
                  focusNodes: link
                })
              } else if (typeof link == 'function') {
                link.call(view);            
              } else {
                view.setState({
                  focusNodes: [d[2]]
                })
              }
            }
            d3.event.stopPropagation();
          })
          .on('dblclick', d=>{
            if (d.length > 2) {
              let link = d[2];
              if (Array.isArray(d[2])) {
                //do nothing
              } else if (typeof link == 'function') {
                //do nothing
              } else {
                view.setState({
                  root: link
                })             
              }
            }
          })
    //update nodes with focus
    this.container.selectAll("rect")
      .classed('focus', d=> (view.state.focusNodes.includes(d.node)));

    debug('end infoBox')
    if (shouldRedraw) {
      this.drawEdgesAndNodes();
    }
  }
}

class InfoBox{
  constructor(props = {}) {
    this.state = {
      title: props.title || null,
      data: props.data || {},
      limitedKeys: props.limitedKeys || {},
      links: props.links || {}
    }
  }
}

function generateRandomTree(size, //total number of nodes in trees
    levelCount, //total number of levels in tree
    perLevelCount = null, //array of length <levelCount> OR function name (linear, quadratic, exponential, log, asymptotic) OR function(levelNumber) => numberOfNodes
    childProbDist = null) { //function with domain [0, levelCount - 1]...
  if (perLevelCount === null) {
    perLevelCount = (level)=>(2 << level);
  }
  let lastLevel = null;
  let currentLevel = [];
  let nodesAdded = 0;
  let currentLevelIndex = 0;
  let rootNode;

  while (nodesAdded < size) {
    let nodeId = currentLevelIndex + "_" + currentLevel.length;
    let node = new MkTreeNode({id: nodeId, data: {}});
    currentLevel.push(node);
    nodesAdded++;

    if (currentLevelIndex !== 0) {
      let parent = lastLevel[Math.floor(Math.random()*lastLevel.length)];
      parent.addChild(node);
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
  
  return new MkTreeView({root: rootNode});
}

debug('loaded script');
