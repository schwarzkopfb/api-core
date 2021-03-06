export declare class ApiEdgeSchemaTransformation {
    applyToInput: (schema: any, model: any) => void;
    applyToOutput: (mode: any, schema: any) => void;
    affectedSchemaField: string;
    affectedModelFields: string[];
    parsedField: any;
    constructor(input: (schema: any, model: any) => void, output: (model: any, schema: any) => void, modelFields: string[], schemaField?: string);
    setSchemaField(field: string): void;
}
export declare class ApiEdgeSchema {
    fields: string[];
    transformations: ApiEdgeSchemaTransformation[];
    private fieldMatrix;
    private renameMatrix;
    transformField: (field: string) => string;
    transformFields: (fields: string[]) => string[];
    private createInputTransformer(schemaField, transform);
    private static createOutputTransformer(schemaField, transform);
    private createTransformation(schemaField, schema);
    private fixFields(fieldName);
    constructor(schema: any);
}
