import {QueryStep, ApiQueryScope, ApiQuery} from "./ApiQuery";
import {ApiEdgeQuery} from "../edge/ApiEdgeQuery";
import {ApiEdgeQueryContext} from "../edge/ApiEdgeQueryContext";
import {ApiEdgeRelation} from "../relations/ApiEdgeRelation";
import {ApiEdgeError} from "./ApiEdgeError";
import {ApiEdgeQueryFilterType} from "../edge/ApiEdgeQueryFilter";
import {
    PathSegment, EntryPathSegment, RelatedFieldPathSegment, ApiRequest,
    EdgePathSegment, ApiRequestType, MethodPathSegment
} from "../request/ApiRequest";
import {ApiEdgeQueryResponse} from "../edge/ApiEdgeQueryResponse";
import {ApiEdgeQueryType} from "../edge/ApiEdgeQueryType";
import {OneToOneRelation} from "../relations/OneToOneRelation";
import {Api} from "../Api";
import {ApiEdgeMethod} from "../edge/ApiEdgeMethod";
import {ApiEdgeAction, ApiEdgeActionTriggerKind, ApiEdgeActionTrigger} from "../edge/ApiEdgeAction";
import {ApiAction, ApiActionTriggerKind} from "./ApiAction";
const parse = require('obj-parse');

export class EmbedQueryQueryStep implements QueryStep {
    query: ApiQuery;
    segment: EntryPathSegment;
    targetField: string;

    constructor(query: ApiQuery, segment: EntryPathSegment) {
        this.query = query;
        this.segment = segment;

        if(!this.segment.relation) throw new Error('Invalid relation provided.');
        this.targetField = this.segment.relation.name;
    }

    private executeSingle = (scope: ApiQueryScope, target: any) => {
        return new Promise((resolve, reject) => {
            //Now we can replace TBD and provide a real id for the query.
            this.segment.id = target[this.targetField];

            this.query.execute(scope.identity).then((response) => {
                target[this.targetField] = response;
                resolve(scope)
            }).catch(reject);
        })
    };

    execute = (scope: ApiQueryScope) => {
        return new Promise((resolve, reject) => {
            if(scope.response) {
                if(Array.isArray(scope.response.data)) {
                    const p = Promise.resolve();
                    for(let entry of scope.response.data) {
                        p.then(() => this.executeSingle(scope, entry))
                    }
                    p.then(() => resolve(scope), reject)
                }
                else {
                    this.executeSingle(scope, scope.response.data).then(resolve, reject)
                }
            }
            else resolve(scope)
        })
    };

    inspect = () => `EMBED QUERY /${this.targetField}`;
}

export class QueryEdgeQueryStep implements QueryStep {
    query: ApiEdgeQuery;

    constructor(query: ApiEdgeQuery) {
        this.query = query;
    }

    execute = (scope: ApiQueryScope) => {
        return new Promise((resolve, reject) => {
            this.query.body = scope.body;
            this.query.context = scope.context;

            this.query.execute().then((response) => {
                scope.context = new ApiEdgeQueryContext();
                scope.response = response;
                resolve(scope)
            }).catch(reject);
        })
    };

    inspect = () => `QUERY /${this.query.edge.pluralName}`;
}

export class CallMethodQueryStep implements QueryStep {
    method: ApiEdgeMethod;

    constructor(method: ApiEdgeMethod) {
        this.method = method;
    }

    execute = (scope: ApiQueryScope) => {
        return new Promise((resolve, reject) => {
            this.method.execute(scope).then((response) => {
                scope.response = response;
                resolve(scope)
            }).catch(reject);
        })
    };

    inspect = () => `call{${this.method.name}}`;
}

export class RelateQueryStep implements QueryStep {
    relation: ApiEdgeRelation;

    constructor(relation: ApiEdgeRelation) {
        this.relation = relation;
    }

    execute = (scope: ApiQueryScope) => {
        return new Promise((resolve, reject) => {
            if(!scope.response) return reject(new ApiEdgeError(404, "Missing Related Entry"));
            scope.context.filter(this.relation.relationId, ApiEdgeQueryFilterType.Equals, scope.response.data[this.relation.from.idField||Api.defaultIdField]);
            resolve(scope);
        })
    };

    inspect = () => `RELATE ${this.relation.relationId}`;
}

export class RelateChangeQueryStep implements QueryStep {
    relation: ApiEdgeRelation;

    constructor(relation: ApiEdgeRelation) {
        this.relation = relation;
    }

    execute = (scope: ApiQueryScope) => {
        return new Promise((resolve, reject) => {
            if(!scope.body) return reject(new ApiEdgeError(404, "Missing Body"));
            if(!scope.response) return reject(new ApiEdgeError(404, "Missing Related Entry"));
            parse(this.relation.relationId).assign(
                scope.body,
                scope.response.data[this.relation.from.idField||Api.defaultIdField]);
            resolve(scope);
        })
    };

    inspect = () => `RELATE CHANGE ${this.relation.relationId}`;
}

/*export class CheckResponseQueryStep implements QueryStep {
    execute = (scope: QueryScope) => {
        return new Promise((resolve, reject) => {
            if(!scope.response) return reject(new ApiEdgeError(404, "Missing Related Entry"));
            resolve(scope);
        })
    };

    inspect = () => `CHECK`;
}

export class NotImplementedQueryStep implements QueryStep {
    description: string;

    constructor(description: string) {
        this.description = description;
    }

    execute = (scope: QueryScope) => {
        return new Promise(resolve => {
            resolve(scope);
        })
    };

    inspect = () => `NOT IMPLEMENTED: ${this.description}`;
}*/

export class SetResponseQueryStep implements QueryStep {
    response: ApiEdgeQueryResponse;

    constructor(response: ApiEdgeQueryResponse) {
        this.response = response;
    }

    execute = (scope: ApiQueryScope) => {
        return new Promise(resolve => {
            scope.response = this.response;
            scope.context = new ApiEdgeQueryContext();
            resolve(scope);
        })
    };

    inspect = () => `SET RESPONSE`;
}

export class SetBodyQueryStep implements QueryStep {
    body: any;

    constructor(body: any) {
        this.body = body;
    }

    execute = (scope: ApiQueryScope) => {
        return new Promise(resolve => {
            scope.body = this.body;
            resolve(scope);
        })
    };

    inspect = () => `SET BODY`;
}

export class ProvideIdQueryStep implements QueryStep {
    fieldName: string;

    constructor(fieldName: string = Api.defaultIdField) {
        this.fieldName = fieldName;
    }

    execute = (scope: ApiQueryScope) => {
        return new Promise((resolve, reject) => {
            if(!scope.response) return reject(new ApiEdgeError(404, "Missing Entry"));
            scope.context.id = scope.response.data[this.fieldName];
            resolve(scope);
        })
    };

    inspect = () => `PROVIDE ID: ${this.fieldName}`;
}

export class ExtendContextQueryStep implements QueryStep {
    context: ApiEdgeQueryContext;

    constructor(context: ApiEdgeQueryContext) {
        this.context = context
    }

    execute = (scope: ApiQueryScope) => {
        return new Promise(resolve => {
            scope.context.id = this.context.id || scope.context.id;
            if(this.context.pagination) {
                scope.context.pagination = this.context.pagination;
            }
            this.context.fields.forEach(f => scope.context.fields.push(f));
            this.context.populatedRelations.forEach(f => scope.context.populatedRelations.push(f));
            this.context.filters.forEach(f => scope.context.filters.push(f));
            this.context.sortBy.forEach(f => scope.context.sortBy.push(f));
            resolve(scope)
        })
    };

    inspect = () => {
        if(this.context.id) {
            return `EXTEND CONTEXT (id=${this.context.id})`
        }
        else {
            return `APPLY PARAMETERS`
        }
    };
}

export class ExtendContextLiveQueryStep implements QueryStep {
    apply: (context: ApiEdgeQueryContext) => void|any;

    constructor(func: (context: ApiEdgeQueryContext) => void|any) {
        this.apply = func
    }

    execute = (scope: ApiQueryScope) => {
        return new Promise(resolve => {
            this.apply(scope.context);
            resolve(scope)
        })
    };

    inspect = () => {
        return `EXTEND CONTEXT LIVE`
    };
}

/*export class GenericQueryStep implements QueryStep {
    description: string;
    step: () => Promise<QueryScope>;
    context: any;

    constructor(description: string, step: () => Promise<QueryScope>, context: any) {
        this.description = description;
        this.step = step;
        this.context = context;
    }

    execute = (scope: QueryScope) => {
        return this.step.apply(this.context, [ scope ]);
    };

    inspect = () => this.description
}*/

export class ApiQueryBuilder {
    api: Api;

    constructor(api: Api) {
        this.api = api;
    }

    private addQueryActions(triggerKind: ApiEdgeActionTriggerKind,
                            query: ApiQuery,
                            edgeQuery: ApiEdgeQuery,
                            relation: ApiEdgeRelation|null,
                            output: boolean = false) {
        const edge = edgeQuery.edge,
            queryType = edgeQuery.type,
            trigger = relation ?
                ApiEdgeActionTrigger.Relation :
                (output ? ApiEdgeActionTrigger.OutputQuery : ApiEdgeActionTrigger.SubQuery);

        let actions: ApiEdgeAction[];
        if(relation) {
            actions = edge.actions.filter((action: ApiEdgeAction) =>
                action.triggerKind == triggerKind &&
                (action.targetTypes & queryType) &&
                (action.triggers & trigger) &&
                (!action.triggerNames.length || action.triggerNames.indexOf(relation.name) == -1))
        }
        else {
            actions = edge.actions.filter((action: ApiEdgeAction) =>
                action.triggerKind == triggerKind &&
                (action.targetTypes & queryType) &&
                (action.triggers & trigger))
        }

        actions.forEach((action: ApiEdgeAction) => query.unshift(action));

        if(output) {
            const apiTrigger = triggerKind == ApiEdgeActionTriggerKind.BeforeEvent ?
                ApiActionTriggerKind.BeforeOutput : ApiActionTriggerKind.AfterOutput;
            this.api.actions
                .filter((action: ApiAction) => action.triggerKind == apiTrigger)
                .forEach((action: ApiAction) => query.unshift(action))
        }
    }

    private static addMethodCallStep(request: ApiRequest, query: ApiQuery, method: ApiEdgeMethod) {
        if(method.acceptedTypes & request.type) {
            //TODO: this.addPostMethodActions(request, query, method);
            query.unshift(new CallMethodQueryStep(method));
            //TODO: this.addPreMethodActions(request, query, method);
        }
        else {
            throw new ApiEdgeError(405, "Method Not Allowed");
        }
    }

    private addQueryStep(query: ApiQuery,
                         step: QueryEdgeQueryStep,
                         relation: ApiEdgeRelation|null = null,
                         output: boolean = false) {
        this.addQueryActions(ApiEdgeActionTriggerKind.AfterEvent, query, step.query, relation, output);
        query.unshift(step);
        this.addQueryActions(ApiEdgeActionTriggerKind.BeforeEvent, query, step.query, relation, output);
    }

    private static buildProvideIdStep(query: ApiQuery, currentSegment: PathSegment): boolean {
        if(currentSegment instanceof EntryPathSegment) {
            query.unshift(new ExtendContextLiveQueryStep(context => context.id = currentSegment.id));
            return false
        }
        else if(currentSegment instanceof RelatedFieldPathSegment) {
            query.unshift(new ProvideIdQueryStep(currentSegment.relation.relationId));
            return true
        }
        else {
            //TODO: Add support for method calls with parameters
            return false
        }
    }

    private buildCheckStep(query: ApiQuery, currentSegment: PathSegment): boolean {
        //STEP 1: Create the check query.
        //TODO: Check this code...
        if(currentSegment instanceof EntryPathSegment) {
            query.unshift(new SetResponseQueryStep(new ApiEdgeQueryResponse({ [currentSegment.edge.idField||Api.defaultIdField]: currentSegment.id })));
            return false
        }
        else if(currentSegment instanceof RelatedFieldPathSegment) {
            this.addQueryStep(query, new QueryEdgeQueryStep(new ApiEdgeQuery(currentSegment.relation.to, ApiEdgeQueryType.Get)), currentSegment.relation);
        }
        else {
            //TODO: Add support for method calls (non-base query case)
            throw new ApiEdgeError(500, "Not Implemented")
        }

        //STEP 2: Provide ID for the check query.
        return ApiQueryBuilder.buildProvideIdStep(query, currentSegment)
    }

    private buildReadStep(query: ApiQuery, currentSegment: PathSegment): boolean {
        //STEP 1: Create the read query.
        if(currentSegment instanceof RelatedFieldPathSegment) {
            this.addQueryStep(query, new QueryEdgeQueryStep(new ApiEdgeQuery(currentSegment.relation.to, ApiEdgeQueryType.Get)), currentSegment.relation);
        }
        else {
            this.addQueryStep(query, new QueryEdgeQueryStep(new ApiEdgeQuery(currentSegment.edge, ApiEdgeQueryType.Get)));
        }

        //STEP 2: Provide ID for the read query.
        return ApiQueryBuilder.buildProvideIdStep(query, currentSegment)
    }

    private buildEmbedSteps(query: ApiQuery, request: ApiRequest) {
        for(let relation of request.context.populatedRelations) {
            // The id is literally TBD, it is going to be set one we have the data,
            // what we build now is only an execution plan.
            const segment = new EntryPathSegment(relation.to, 'TBD', null);

            const embedRequest = new ApiRequest(request.api);
            embedRequest.path.add(segment);

            // We add the step directly directly, as pre- and post-actions are not
            // supported on embed query steps. These actions will be executed as
            // part of the sub-query.
            query.unshift(new EmbedQueryQueryStep(this.build(embedRequest), segment));
        }
    }

    private buildReadQuery = (request: ApiRequest): ApiQuery => {
        let query = new ApiQuery();

        let segments = request.path.segments,
            lastSegment = segments[segments.length-1];

        //STEP 0: Create embed queries
        this.buildEmbedSteps(query, request);

        //STEP 1: Create the base query which will provide the final data.
        let baseQuery: ApiEdgeQuery;
        if(lastSegment instanceof EdgePathSegment) {
            baseQuery = new ApiEdgeQuery(lastSegment.edge, ApiEdgeQueryType.List);
            this.addQueryStep(query, new QueryEdgeQueryStep(baseQuery), null, true);
        }
        else if(lastSegment instanceof RelatedFieldPathSegment) {
            baseQuery = new ApiEdgeQuery(lastSegment.relation.to, ApiEdgeQueryType.Get);
            this.addQueryStep(query, new QueryEdgeQueryStep(baseQuery), lastSegment.relation, true);

        }
        else if(lastSegment instanceof MethodPathSegment) {
            ApiQueryBuilder.addMethodCallStep(request, query, lastSegment.method);
            query.unshift(new ProvideIdQueryStep(lastSegment.edge.idField));
        }
        else {
            baseQuery = new ApiEdgeQuery(lastSegment.edge, ApiEdgeQueryType.Get);
            this.addQueryStep(query, new QueryEdgeQueryStep(baseQuery), null, true);
        }

        //STEP 2: Provide context for the base query.
        query.unshift(new ExtendContextQueryStep(request.context));

        //STEP 3: Provide ID for the base query.
        if(lastSegment instanceof EntryPathSegment) {
            const _segment = lastSegment; //Add closure to make sure it won't be overridden later.
            query.unshift(new ExtendContextLiveQueryStep(context => context.id = _segment.id))
        }
        else if(lastSegment instanceof RelatedFieldPathSegment) {
            query.unshift(new ProvideIdQueryStep(lastSegment.relation.relationId))
        }
        else {
            //TODO: Add support for method calls with parameters
        }

        //STEP 4: Provide filters and validation for the base query.
        let readMode = true;
        for(let i = segments.length-2; i >= 0; i--) {
            let currentSegment = segments[i];

            //STEP 1: Relate to the current query.
            let relation = segments[i+1].relation;
            if(relation && !(relation instanceof OneToOneRelation)) {
                query.unshift(new RelateQueryStep(relation));
            }

            //STEP 2: Read or Check
            if(readMode) {
                readMode = this.buildReadStep(query, currentSegment)
            }
            else {
                readMode = this.buildCheckStep(query, currentSegment)
            }
        }

        //STEP 5: Add OnInput actions
        this.api.actions
            .filter((action: ApiAction) => action.triggerKind == ApiActionTriggerKind.OnInput)
            .forEach((action: ApiAction) => query.unshift(action));

        //STEP 6: Return the completed query.
        return query
    };

    private buildChangeQuery = (request: ApiRequest): ApiQuery => {
        let query = new ApiQuery();

        let segments = request.path.segments,
            lastSegment = segments[segments.length-1],
            readMode = true;

        //STEP 0: Create embed queries
        this.buildEmbedSteps(query, request);

        //STEP 1: Create the base query which will provide the final data.
        let baseQuery: ApiEdgeQuery;
        if(lastSegment instanceof RelatedFieldPathSegment) {
            if(request.type === ApiRequestType.Update) {
                baseQuery = new ApiEdgeQuery(lastSegment.edge, ApiEdgeQueryType.Patch);
                request.body = { [lastSegment.relation.relationId]: request.body.id||request.body._id };
                this.addQueryStep(query, new QueryEdgeQueryStep(baseQuery), null, true);
            }
            else if(request.type === ApiRequestType.Patch) {
                baseQuery = new ApiEdgeQuery(lastSegment.relation.to, ApiEdgeQueryType.Patch);
                this.addQueryStep(query, new QueryEdgeQueryStep(baseQuery), null, true);
            }
            else {
                throw new ApiEdgeError(400, "Invalid Delete Query");
            }
        }
        else if(lastSegment instanceof MethodPathSegment) {
            ApiQueryBuilder.addMethodCallStep(request, query, lastSegment.method);
            query.unshift(new ProvideIdQueryStep(lastSegment.edge.idField));
            readMode = false;
        }
        else {
            if(request.type === ApiRequestType.Update) {
                baseQuery = new ApiEdgeQuery(lastSegment.edge, ApiEdgeQueryType.Update);
                this.addQueryStep(query, new QueryEdgeQueryStep(baseQuery), null, true);
            }
            else if(request.type === ApiRequestType.Patch) {
                baseQuery = new ApiEdgeQuery(lastSegment.edge, ApiEdgeQueryType.Patch);
                this.addQueryStep(query, new QueryEdgeQueryStep(baseQuery), null, true);
            }
            else {
                baseQuery = new ApiEdgeQuery(lastSegment.edge, ApiEdgeQueryType.Delete);
                this.addQueryStep(query, new QueryEdgeQueryStep(baseQuery), null, true);
            }
        }

        //STEP 2: Provide context for the base query.
        query.unshift(new ExtendContextQueryStep(request.context));

        //STEP 3: Provide ID for the base query.
        if(lastSegment instanceof EntryPathSegment) {
            const _segment = lastSegment; //Add closure to make sure it won't be overridden later.
            query.unshift(new ExtendContextLiveQueryStep(context => context.id = _segment.id))
        }
        else if(lastSegment instanceof RelatedFieldPathSegment) {
            if(request.type === ApiRequestType.Update) {
                let previousSegment = segments[segments.length-2];
                query.unshift(new ProvideIdQueryStep(previousSegment.edge.idField||Api.defaultIdField));
                readMode = false; //Provide ID from the previous segment without querying the database.
            }
            else {
                query.unshift(new ProvideIdQueryStep(lastSegment.relation.relationId))
            }
        }
        else {
            //TODO: Add support for method calls with parameters
        }

        //STEP 4: Provide filters and validation for the base query.
        for(let i = segments.length-2; i >= 0; i--) {
            let currentSegment = segments[i];

            //STEP 1: Relate to the current query.
            let relation = segments[i+1].relation;
            if(relation && !(relation instanceof OneToOneRelation)) {
                query.unshift(new RelateQueryStep(relation));
                if(request.type !== ApiRequestType.Delete) {
                    query.unshift(new RelateChangeQueryStep(relation));
                }
            }

            //STEP 2: Read or Check
            if(readMode) {
                readMode = this.buildReadStep(query, currentSegment)
            }
            else {
                readMode = this.buildCheckStep(query, currentSegment)
            }
        }

        //STEP 5: Provide body for the query
        if(request.body) query.unshift(new SetBodyQueryStep(request.body));

        //STEP 6: Add OnInput actions
        this.api.actions
            .filter((action: ApiAction) => action.triggerKind == ApiActionTriggerKind.OnInput)
            .forEach((action: ApiAction) => query.unshift(action));

        //STEP 7: Return the completed query.
        return query
    };

    private buildCreateQuery = (request: ApiRequest): ApiQuery => {
        let query = new ApiQuery();

        let segments = request.path.segments,
            lastSegment = segments[segments.length-1];

        //STEP 1: Create the base query which will provide the final data.
        this.addQueryStep(query, new QueryEdgeQueryStep(new ApiEdgeQuery(lastSegment.edge, ApiEdgeQueryType.Create)));

        //STEP 2: Provide filters and validation for the base query.
        for(let i = segments.length-2; i >= 0; i--) {
            let currentSegment = segments[i];

            //STEP 1: Relate to the current query.
            let relation = segments[i+1].relation;
            if(relation && !(relation instanceof OneToOneRelation)) {
                query.unshift(new RelateChangeQueryStep(relation));
            }

            //STEP 2: Read or Check
            this.buildReadStep(query, currentSegment)
        }

        //STEP 3: Provide context for the base query.
        query.unshift(new SetBodyQueryStep(request.body));

        //STEP 4: Add OnInput actions
        this.api.actions
            .filter((action: ApiAction) => action.triggerKind == ApiActionTriggerKind.OnInput)
            .forEach((action: ApiAction) => query.unshift(action));

        //STEP 5: Return the completed query.
        return query
    };


    build = (request: ApiRequest): ApiQuery => {
        switch(request.type) {
            case ApiRequestType.Read:
                return this.buildReadQuery(request);
            case ApiRequestType.Update:
            case ApiRequestType.Patch:
            case ApiRequestType.Delete:
                return this.buildChangeQuery(request);
            case ApiRequestType.Create:
                return this.buildCreateQuery(request);
            default:
                throw new ApiEdgeError(400, "Unsupported Query Type")
        }
    }
}
