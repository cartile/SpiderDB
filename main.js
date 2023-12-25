Spider = {}

Spider.G = {}

Spider.graph = function(V, E) {
    let graph = Object.create( Spider.G )

    graph.edges = []
    graph.vertices = []
    graph.vertexIndex = {}

    graph.autoid = 1

    if(Array.isArray(V)) graph.addVertices(V)
    if(Array.isArray(E)) graph.addEdges(E)

    return graph
}

Spider.G.addVertices = function(vs) { vs.forEach(this.addVertex.bind(this)) }
Spider.G.addEdges = function(es) { es.forEach(this.addEdge.bind(this)) }

Spider.G.addVertex = function(vertex) {
    if (!vertex.id) {
        vertex.id = this.autoid++
    } else if (this.findVertexById(vertex._id)){
        return Spider.error('A vertex with that id already exists')
    }

    this.vertices.push(vertex)
    this.vertexIndex[vertex._id] = vertex
    vertex._out = []
    vertex._in = []
    return vertex._id
}

Spider.g.addEdge = function(edge) {
    edge._in = this.findVertexById(edge._in)
    edge._out = this.findVertexById(edge._out)

    if(!(edge._in && edge._out)) {
        return Spider.error("That edge's " + (edge._in ? 'out' : 'in')
                                       + " vertex wasn't found")
    }
}

Spider.error = function(msg) {
    console.log(msg)
    return false
  }
