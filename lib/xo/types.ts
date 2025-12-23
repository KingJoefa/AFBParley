export type XoSourceId = string;

export type XoWeek = number; // 0 for season totals, 1-18 weekly

export interface XoRow {
	combination_name: string;
	source_id: XoSourceId;
	year: number;
	week: XoWeek;
	esbid: string | number;
	decimal_odds: number;
	american_odds: number;
	timestamp: number;
	// denormalized legs (selection_1_* .. selection_4_*)
	[key: string]: unknown;
}

export interface XoLeg {
	player?: {
		first?: string;
		last?: string;
		team?: string; // NFL team code e.g. KC, WAS
		position?: string;
	};
	marketType: string;
	line: number | null;
	selectionType: string | null;
}

export interface XoCombo {
	combinationName: string;
	sourceId: XoSourceId;
	year: number;
	week: XoWeek;
	esbid: string | number;
	decimalOdds: number;
	americanOdds: number;
	timestamp: number;
	legs: XoLeg[];
}

export interface FetchCombosParams {
	year: number;
	week: XoWeek;
	sourceId?: XoSourceId;
	limit?: number;
	offset?: number;
}


